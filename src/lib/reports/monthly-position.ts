import type { TxClient } from "@/lib/db/rls";
import { pacificMidnight, pacificMonthStart, PACIFIC_TZ } from "@/lib/cron/pacific";
import { resolveRate, toRate } from "@/lib/billing/rates";
import { expenseInRange } from "@/lib/reports/profitability";
import { EXPENSE_CATEGORIES, categoryOf, type ExpenseCategory } from "@/lib/billing/expense-categories";

/**
 * One month's operating position: what the business earned, what it cost to
 * run, and what is left.
 *
 * The revenue lines are kept apart on purpose -- billable time, recurring
 * charges and retainers are three different kinds of money, and invoices
 * raised or payments received are shown as REFERENCE only, never added in.
 * An invoice can bill last month's work; counting both would count it twice.
 *
 * Monthly-equivalent throughout: an annual charge or cost counts as a twelfth
 * of itself in every month, so a January licence renewal doesn't make January
 * look like a loss and the other eleven months look better than they are.
 */
export type MonthlyPosition = {
  month: string;
  label: string;
  revenue: {
    billableTime: number;
    billableHours: number;
    recurring: number;
    recurringCount: number;
    retainers: number;
    retainerCount: number;
    gross: number;
  };
  reference: {
    invoiced: number;
    paymentsReceived: number;
    /** Hours on SecureTECC's own work. Tracked, never revenue. */
    internalHours: number;
  };
  costs: {
    byCategory: { category: ExpenseCategory; amount: number; items: { name: string; amount: number }[] }[];
    /** What delivering the recurring services costs (the `cost` on each charge). */
    recurringDelivery: number;
    total: number;
  };
  net: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** "2026-09" -> that month's Pacific bounds; anything else -> this month. */
export function resolveMonth(value?: string): { month: string; start: Date; end: Date; label: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  let y: number;
  let mo: number;
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    y = Number(m[1]);
    mo = Number(m[2]);
  } else {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ, year: "numeric", month: "2-digit" })
      .format(pacificMonthStart())
      .split("-");
    y = Number(parts[0]);
    mo = Number(parts[1]);
  }
  const start = pacificMidnight(y, mo, 1);
  const end = mo === 12 ? pacificMidnight(y + 1, 1, 1) : pacificMidnight(y, mo + 1, 1);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, mo - 1, 15)),
  );
  return { month: `${y}-${String(mo).padStart(2, "0")}`, start, end, label };
}

export async function loadMonthlyPosition(tx: TxClient, monthParam?: string): Promise<MonthlyPosition> {
  const { month, start, end, label } = resolveMonth(monthParam);
  // Date-only columns are stored at UTC midnight; compare them by calendar day.
  const dayStart = new Date(`${month}-01T00:00:00Z`);
  const dayEnd = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth() + 1, 1));

  const [entries, charges, retainerClients, expenses, invoiced, payments, internal] = await Promise.all([
    tx.timeEntry.findMany({
      where: {
        billableStatus: "Billable",
        date: { gte: dayStart, lt: dayEnd },
        client: { billingType: "Hourly", isInternal: false },
      },
      select: {
        date: true,
        durationHours: true,
        rateOverride: true,
        serviceType: { select: { rateOverride: true, scheduledRate: true, scheduledRateFrom: true } },
        client: { select: { billingRate: true, scheduledRate: true, scheduledRateFrom: true } },
      },
    }),
    tx.recurringCharge.findMany({
      where: {
        activeStatus: true,
        client: { activeStatus: true, isInternal: false },
        OR: [{ startDate: null }, { startDate: { lt: dayEnd } }],
      },
      select: { amount: true, cost: true, billingFrequency: true },
    }),
    tx.client.findMany({
      where: { billingType: "Retainer", activeStatus: true, isInternal: false },
      select: { billingRate: true },
    }),
    tx.businessExpense.findMany(),
    tx.invoice.aggregate({
      where: { voidedAt: null, createdAt: { gte: start, lt: end } },
      _sum: { totalAmount: true },
    }),
    tx.payment.aggregate({
      where: { receivedAt: { gte: dayStart, lt: dayEnd } },
      _sum: { amount: true },
    }),
    // Internal work is deliberately counted in HOURS only: it earns nothing,
    // and giving it a value would invite it into a revenue figure later.
    tx.timeEntry.aggregate({
      where: { client: { isInternal: true }, date: { gte: dayStart, lt: dayEnd } },
      _sum: { durationHours: true },
    }),
  ]);

  let billableTime = 0;
  let billableHours = 0;
  for (const e of entries) {
    const hours = Number(e.durationHours);
    const rate =
      resolveRate({
        entryRateOverride: toRate(e.rateOverride),
        serviceTypeRateOverride: toRate(e.serviceType.rateOverride),
        serviceTypeScheduledRate: toRate(e.serviceType.scheduledRate),
        serviceTypeScheduledRateFrom: e.serviceType.scheduledRateFrom,
        clientBillingRate: toRate(e.client.billingRate),
        clientScheduledRate: toRate(e.client.scheduledRate),
        clientScheduledRateFrom: e.client.scheduledRateFrom,
        entryDate: e.date,
      }) ?? 0;
    billableHours += hours;
    billableTime += hours * rate;
  }

  const perMonth = (amount: number, frequency: string) => (frequency === "Annual" ? amount / 12 : amount);
  const recurring = charges.reduce((s, c) => s + perMonth(Number(c.amount), c.billingFrequency), 0);
  const recurringDelivery = charges.reduce(
    (s, c) => s + (c.cost === null ? 0 : perMonth(Number(c.cost), c.billingFrequency)),
    0,
  );
  const retainers = retainerClients.reduce((s, c) => s + Number(c.billingRate ?? 0), 0);

  const byCategory = new Map<ExpenseCategory, { name: string; amount: number }[]>();
  for (const e of expenses) {
    const amount = expenseInRange(
      {
        amount: Number(e.amount),
        frequency: e.frequency,
        clientId: e.clientId,
        startDate: e.startDate,
        endDate: e.endDate,
        activeStatus: e.activeStatus,
      },
      dayStart,
      dayEnd,
      1,
    );
    if (amount === 0) continue;
    const category = categoryOf(e.category);
    byCategory.set(category, [...(byCategory.get(category) ?? []), { name: e.name, amount: round(amount) }]);
  }

  const categories = EXPENSE_CATEGORIES.map((category) => {
    const items = (byCategory.get(category) ?? []).sort((a, b) => b.amount - a.amount);
    return { category, amount: round(items.reduce((s, i) => s + i.amount, 0)), items };
  });
  const expenseTotal = categories.reduce((s, c) => s + c.amount, 0);

  const gross = billableTime + recurring + retainers;
  const costTotal = expenseTotal + recurringDelivery;

  return {
    month,
    label,
    revenue: {
      billableTime: round(billableTime),
      billableHours: round(billableHours),
      recurring: round(recurring),
      recurringCount: charges.length,
      retainers: round(retainers),
      retainerCount: retainerClients.length,
      gross: round(gross),
    },
    reference: {
      invoiced: round(Number(invoiced._sum.totalAmount ?? 0)),
      paymentsReceived: round(Number(payments._sum.amount ?? 0)),
      internalHours: round(Number(internal._sum.durationHours ?? 0)),
    },
    costs: { byCategory: categories, recurringDelivery: round(recurringDelivery), total: round(costTotal) },
    net: round(gross - costTotal),
  };
}

import type { TxClient } from "@/lib/db/rls";
import { resolveRate, toRate } from "@/lib/billing/rates";

/**
 * Work that has been done and not yet invoiced.
 *
 * The dashboard says how much and how old; this is the list behind it, at the
 * level of detail needed to actually raise the invoices -- who, what, when,
 * at what rate, and worth how much.
 *
 * Deliberately NOT limited to a date range. Unbilled work does not expire,
 * and the whole point of the report is the June entry nobody noticed.
 */
export type ToBillEntry = {
  id: string;
  date: string;
  clientId: string;
  clientName: string;
  serviceCode: string;
  serviceLabel: string;
  performedBy: string;
  hours: number;
  rate: number | null;
  amount: number | null;
  description: string;
  ageDays: number;
};

export type ToBillExpense = {
  id: string;
  date: string;
  clientId: string;
  clientName: string;
  description: string;
  amount: number;
  ageDays: number;
};

export type ToBillClient = {
  clientId: string;
  name: string;
  cadence: string;
  hours: number;
  timeValue: number;
  expenseValue: number;
  total: number;
  oldestDays: number;
  /** Past the point this client's billing cycle allows. */
  overdue: boolean;
};

export type ToBillReport = {
  clients: ToBillClient[];
  entries: ToBillEntry[];
  expenses: ToBillExpense[];
  totalHours: number;
  totalValue: number;
  /** Entries whose rate cannot be resolved -- they will block a generation. */
  unratedCount: number;
};

const CADENCE_DAYS: Record<string, number> = { Monthly: 31, Quarterly: 93 };

export async function loadToBill(tx: TxClient, asOf: Date): Promise<ToBillReport> {
  const [entries, expenses] = await Promise.all([
    tx.timeEntry.findMany({
      where: { invoiceId: null, billableStatus: "Billable" },
      select: {
        id: true,
        date: true,
        durationHours: true,
        description: true,
        rateOverride: true,
        client: {
          select: {
            id: true,
            name: true,
            billingRate: true,
            billingCadence: true,
            scheduledRate: true,
            scheduledRateFrom: true,
          },
        },
        serviceType: { select: { code: true, label: true, rateOverride: true, scheduledRate: true, scheduledRateFrom: true } },
        performedByUser: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }],
    }),
    tx.reimbursableExpense.findMany({
      where: { invoiceId: null },
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        client: { select: { id: true, name: true, billingCadence: true } },
      },
      orderBy: [{ date: "asc" }],
    }),
  ]);

  const days = (d: Date) => Math.max(0, Math.floor((asOf.getTime() - d.getTime()) / 86_400_000));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const byClient = new Map<string, ToBillClient>();
  let unratedCount = 0;

  const bump = (
    id: string,
    name: string,
    cadence: string,
    ageDays: number,
  ): ToBillClient => {
    const row =
      byClient.get(id) ??
      {
        clientId: id,
        name,
        cadence,
        hours: 0,
        timeValue: 0,
        expenseValue: 0,
        total: 0,
        oldestDays: 0,
        overdue: false,
      };
    row.oldestDays = Math.max(row.oldestDays, ageDays);
    byClient.set(id, row);
    return row;
  };

  const entryRows: ToBillEntry[] = entries.map((e) => {
    const hours = Number(e.durationHours);
    const rate = resolveRate({
      entryRateOverride: toRate(e.rateOverride),
      serviceTypeRateOverride: toRate(e.serviceType.rateOverride),
      serviceTypeScheduledRate: toRate(e.serviceType.scheduledRate),
      serviceTypeScheduledRateFrom: e.serviceType.scheduledRateFrom,
      clientBillingRate: toRate(e.client.billingRate),
      clientScheduledRate: toRate(e.client.scheduledRate),
      clientScheduledRateFrom: e.client.scheduledRateFrom,
      entryDate: e.date,
    });
    if (rate === null) unratedCount++;
    const amount = rate === null ? null : round2(hours * rate);
    const ageDays = days(e.date);

    const row = bump(e.client.id, e.client.name, e.client.billingCadence, ageDays);
    row.hours += hours;
    row.timeValue += amount ?? 0;

    return {
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      clientId: e.client.id,
      clientName: e.client.name,
      serviceCode: e.serviceType.code,
      serviceLabel: e.serviceType.label,
      performedBy: e.performedByUser.name,
      hours,
      rate,
      amount,
      description: e.description,
      ageDays,
    };
  });

  const expenseRows: ToBillExpense[] = expenses.map((x) => {
    const amount = Number(x.amount);
    const ageDays = days(x.date);
    const row = bump(x.client.id, x.client.name, x.client.billingCadence, ageDays);
    row.expenseValue += amount;
    return {
      id: x.id,
      date: x.date.toISOString().slice(0, 10),
      clientId: x.client.id,
      clientName: x.client.name,
      description: x.description,
      amount,
      ageDays,
    };
  });

  const clients = [...byClient.values()]
    .map((c) => ({
      ...c,
      hours: round2(c.hours),
      timeValue: round2(c.timeValue),
      expenseValue: round2(c.expenseValue),
      total: round2(c.timeValue + c.expenseValue),
      // Tony's rule: nothing waits longer than its cycle, and never past a
      // quarter whatever the client's normal pattern.
      overdue: c.oldestDays > (CADENCE_DAYS[c.cadence] ?? 31),
    }))
    // Oldest first: this is a list to work down, and age is what makes a row
    // urgent rather than the amount.
    .sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total);

  return {
    clients,
    entries: entryRows.sort((a, b) => a.date.localeCompare(b.date)),
    expenses: expenseRows.sort((a, b) => a.date.localeCompare(b.date)),
    totalHours: round2(clients.reduce((s, c) => s + c.hours, 0)),
    totalValue: round2(clients.reduce((s, c) => s + c.total, 0)),
    unratedCount,
  };
}

import type { TxClient } from "@/lib/db/rls";
import type { ResolvedRange } from "@/lib/dashboard/metrics";
import { buildAging, type AgingReport } from "./aging";
import { buildProfitability, type ProfitabilitySummary } from "./profitability";

/**
 * Reporting aggregates: what each client is actually worth, and where the
 * hours go.
 *
 * The metric this page exists for is the EFFECTIVE HOURLY RATE -- invoiced
 * value divided by the hours that were billed to produce it. A client on a
 * high nominal rate who absorbs unbilled hours can earn less per hour worked
 * than one on a lower rate, and nothing else in the app surfaces that.
 *
 * Two populations are kept deliberately separate rather than divided into
 * each other:
 *
 *  - INVOICED value and the hours ON those invoices. An invoice raised in
 *    August covers July's work, so dividing August's invoiced value by
 *    August's LOGGED hours would compare two different things and produce a
 *    rate that is simply wrong. The effective rate here uses the hours
 *    attached to the very invoices being counted, so numerator and
 *    denominator always describe the same work.
 *  - LOGGED hours in the range, split billable/non-billable. That answers
 *    "where did the time go", which is a question about the period, not
 *    about any invoice.
 *
 * Ranges are the dashboard's, reused rather than reimplemented, so "last 3
 * months" means the same thing on both pages -- and stays Pacific-correct.
 */

export type ClientReportRow = {
  clientId: string;
  name: string;
  /** Non-voided invoices raised in range. */
  invoicedAmount: number;
  invoiceCount: number;
  /** Hours carried by those invoices. */
  billedHours: number;
  /** invoicedAmount / billedHours, or null when nothing was billed. */
  effectiveRate: number | null;
  /** Hours logged in range, regardless of whether they were invoiced. */
  loggedBillable: number;
  loggedNonBillable: number;
  /** Share of the period's invoiced total, 0-1. */
  share: number;
  /** Nothing invoiced and nothing logged in this period. */
  dormant: boolean;
};

export type ServiceTypeReportRow = {
  code: string;
  label: string;
  hours: number;
  entries: number;
  share: number;
};

/** How quickly a client settles, measured from sent to paid. */
export type PaymentSpeedRow = {
  clientId: string;
  name: string;
  paidCount: number;
  averageDays: number;
  slowestDays: number;
  /** Most common method they pay by, or null when never recorded. */
  usualMethod: string | null;
};

export type ReportsData = {
  clients: ClientReportRow[];
  aging: AgingReport;
  profitability: ProfitabilitySummary;
  serviceTypes: ServiceTypeReportRow[];
  paymentSpeed: PaymentSpeedRow[];
  totals: {
    invoiced: number;
    invoiceCount: number;
    billedHours: number;
    effectiveRate: number | null;
    loggedBillable: number;
    loggedNonBillable: number;
    clientsInvoiced: number;
  };
};

/** Prisma Decimal | number | null -> number. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadReports(tx: TxClient, range: ResolvedRange): Promise<ReportsData> {
  const [
    invoices,
    loggedByClient,
    byServiceType,
    serviceTypes,
    clients,
    settled,
    outstanding,
    expenses,
  ] = await Promise.all([
    // createdAt, matching how the dashboard buckets invoices -- "raised in
    // this period", not "covering this period".
    tx.invoice.findMany({
      where: { voidedAt: null, createdAt: { gte: range.start, lt: range.end } },
      select: { id: true, clientId: true, totalAmount: true },
    }),
    tx.timeEntry.groupBy({
      by: ["clientId", "billableStatus"],
      where: { date: { gte: range.start, lt: range.end } },
      _sum: { durationHours: true },
    }),
    tx.timeEntry.groupBy({
      by: ["serviceTypeId"],
      where: { date: { gte: range.start, lt: range.end } },
      _sum: { durationHours: true },
      _count: true,
    }),
    tx.serviceType.findMany({ select: { id: true, code: true, label: true } }),
    // Internal work is never billed, so it has no place in a revenue report.
    tx.client.findMany({ where: { isInternal: false }, select: { id: true, name: true, activeStatus: true } }),
    // Deliberately NOT limited to the selected range. "How fast does this
    // client pay" is a property of the relationship, and a one-month window
    // would answer it from one or two invoices -- or none at all.
    tx.invoice.findMany({
      where: { voidedAt: null, status: "Paid", sentAt: { not: null }, paidAt: { not: null } },
      select: { clientId: true, sentAt: true, paidAt: true, paymentMethod: true },
    }),
    // Ageing is about what is owed NOW, so it deliberately ignores the
    // selected range: an unpaid invoice from March is still unpaid whichever
    // month you happen to be looking at.
    tx.invoice.findMany({
      where: { voidedAt: null, status: { in: ["Invoiced", "Sent"] } },
      select: {
        id: true,
        invoiceNumber: true,
        clientId: true,
        status: true,
        totalAmount: true,
        sentAt: true,
        issuedAt: true,
        createdAt: true,
        client: { select: { name: true } },
        payments: { select: { amount: true, receivedAt: true, method: true, methodOther: true } },
      },
    }),
    tx.businessExpense.findMany({
      select: {
        amount: true,
        frequency: true,
        clientId: true,
        startDate: true,
        endDate: true,
        activeStatus: true,
      },
    }),
  ]);

  // Hours attached to the invoices counted above -- a second query, because
  // it has to be scoped by invoice id, not by date.
  const invoiceIds = invoices.map((i) => i.id);
  const billedHourRows = invoiceIds.length
    ? await tx.timeEntry.groupBy({
        by: ["clientId"],
        where: { invoiceId: { in: invoiceIds } },
        _sum: { durationHours: true },
      })
    : [];

  const names = new Map(clients.map((c) => [c.id, c.name]));

  const invoiced = new Map<string, { amount: number; count: number }>();
  for (const inv of invoices) {
    const row = invoiced.get(inv.clientId) ?? { amount: 0, count: 0 };
    row.amount += num(inv.totalAmount);
    row.count += 1;
    invoiced.set(inv.clientId, row);
  }

  const billedHours = new Map(
    billedHourRows.map((r) => [r.clientId, num(r._sum.durationHours)]),
  );

  const logged = new Map<string, { billable: number; nonBillable: number }>();
  for (const r of loggedByClient) {
    const row = logged.get(r.clientId) ?? { billable: 0, nonBillable: 0 };
    const hours = num(r._sum.durationHours);
    if (r.billableStatus === "Billable") row.billable += hours;
    else row.nonBillable += hours;
    logged.set(r.clientId, row);
  }

  const totalInvoiced = [...invoiced.values()].reduce((a, r) => a + r.amount, 0);

  // Every ACTIVE client, plus anyone inactive who still has activity in the
  // period. Listing only the clients with movement answers "who was busy",
  // but the question this page gets asked is "how is each client doing" --
  // and a client who billed nothing this quarter is the one worth noticing.
  const clientIds = new Set<string>([
    ...clients.filter((c) => c.activeStatus).map((c) => c.id),
    ...invoiced.keys(),
    ...logged.keys(),
  ]);

  const clientRows: ClientReportRow[] = [...clientIds]
    .map((id) => {
      const inv = invoiced.get(id) ?? { amount: 0, count: 0 };
      const log = logged.get(id) ?? { billable: 0, nonBillable: 0 };
      const hours = billedHours.get(id) ?? 0;
      return {
        clientId: id,
        name: names.get(id) ?? "Unknown client",
        invoicedAmount: round2(inv.amount),
        invoiceCount: inv.count,
        billedHours: round2(hours),
        effectiveRate: hours > 0 ? round2(inv.amount / hours) : null,
        loggedBillable: round2(log.billable),
        loggedNonBillable: round2(log.nonBillable),
        share: totalInvoiced > 0 ? inv.amount / totalInvoiced : 0,
        dormant: inv.count === 0 && log.billable + log.nonBillable === 0,
      };
    })
    // Quiet clients sort last, alphabetically among themselves -- they are
    // context, not the headline, but they must still be findable.
    .sort(
      (a, b) =>
        Number(a.dormant) - Number(b.dormant) ||
        b.invoicedAmount - a.invoicedAmount ||
        b.loggedBillable - a.loggedBillable ||
        a.name.localeCompare(b.name),
    );

  const typeLabels = new Map(serviceTypes.map((t) => [t.id, t]));
  const totalTypeHours = byServiceType.reduce((a, r) => a + num(r._sum.durationHours), 0);
  const serviceRows: ServiceTypeReportRow[] = byServiceType
    .map((r) => {
      const t = typeLabels.get(r.serviceTypeId);
      const hours = num(r._sum.durationHours);
      return {
        code: t?.code ?? "—",
        label: t?.label ?? "Unknown service type",
        hours: round2(hours),
        entries: r._count,
        share: totalTypeHours > 0 ? hours / totalTypeHours : 0,
      };
    })
    .sort((a, b) => b.hours - a.hours);

  // --- payment speed -------------------------------------------------------
  const speed = new Map<string, { days: number[]; methods: string[] }>();
  for (const inv of settled) {
    const days = Math.round((inv.paidAt!.getTime() - inv.sentAt!.getTime()) / 86_400_000);
    // Negative would mean paid before sent, which the write path refuses --
    // guarded here anyway so one bad legacy row can't skew an average.
    if (days < 0) continue;
    const row = speed.get(inv.clientId) ?? { days: [], methods: [] };
    row.days.push(days);
    if (inv.paymentMethod) row.methods.push(inv.paymentMethod);
    speed.set(inv.clientId, row);
  }

  const paymentSpeed: PaymentSpeedRow[] = [...speed]
    .map(([clientId, r]) => {
      const counts = new Map<string, number>();
      for (const m of r.methods) counts.set(m, (counts.get(m) ?? 0) + 1);
      const usual = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        clientId,
        name: names.get(clientId) ?? "Unknown client",
        paidCount: r.days.length,
        averageDays: Math.round(r.days.reduce((a, b) => a + b, 0) / r.days.length),
        slowestDays: Math.max(...r.days),
        usualMethod: usual,
      };
    })
    .sort((a, b) => b.averageDays - a.averageDays);

  const totalBilledHours = [...billedHours.values()].reduce((a, h) => a + h, 0);

  return {
    clients: clientRows,
    aging: buildAging(
      outstanding.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        clientId: i.clientId,
        clientName: i.client.name,
        status: i.status,
        totalAmount: num(i.totalAmount),
        sentAt: i.sentAt,
        issuedAt: i.issuedAt,
        createdAt: i.createdAt,
        payments: i.payments.map((p) => ({
          amount: num(p.amount),
          receivedAt: p.receivedAt,
          method: p.method,
          methodOther: p.methodOther,
        })),
      })),
      new Date(),
    ),
    profitability: buildProfitability({
      invoicedByClient: new Map(
        [...invoiced].map(([id, r]) => [id, { name: names.get(id) ?? "Unknown client", amount: r.amount }]),
      ),
      expenses: expenses.map((e) => ({
        amount: num(e.amount),
        frequency: e.frequency,
        clientId: e.clientId,
        startDate: e.startDate,
        endDate: e.endDate,
        activeStatus: e.activeStatus,
      })),
      clientNames: names,
      start: range.start,
      end: range.end,
      // The range's own month buckets, so a monthly cost is counted once per
      // month the report covers rather than once per report.
      monthsInRange: Math.max(1, range.buckets.length),
    }),
    serviceTypes: serviceRows,
    paymentSpeed,
    totals: {
      invoiced: round2(totalInvoiced),
      invoiceCount: invoices.length,
      billedHours: round2(totalBilledHours),
      effectiveRate: totalBilledHours > 0 ? round2(totalInvoiced / totalBilledHours) : null,
      loggedBillable: round2(clientRows.reduce((a, r) => a + r.loggedBillable, 0)),
      loggedNonBillable: round2(clientRows.reduce((a, r) => a + r.loggedNonBillable, 0)),
      clientsInvoiced: invoiced.size,
    },
  };
}

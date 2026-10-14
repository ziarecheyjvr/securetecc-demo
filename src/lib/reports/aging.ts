import { settle } from "@/lib/billing/payments";
import type { PaymentMethodValue } from "@/lib/payment-methods";

/**
 * Accounts receivable, bucketed by how long the money has been owed.
 *
 * Counted from when the invoice was SENT, falling back to when it was issued:
 * the clock on a client starts when they receive the bill, not when it was
 * drafted. Buckets are the conventional 0-30 / 31-60 / 61-90 / 90+, which is
 * what an accountant and a bank both expect to see.
 *
 * Partly-paid invoices contribute their BALANCE, not their face value --
 * $2,000 invoiced with $1,000 received is $1,000 of receivable, and counting
 * the whole invoice would overstate what is owed.
 */
export type AgingBucket = "current" | "d31_60" | "d61_90" | "d90plus";

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "0–30 days",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  d90plus: "Over 90 days",
};

export type AgingRow = {
  clientId: string;
  name: string;
  current: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
  /** The longest any single balance on this client has been outstanding. */
  oldestDays: number;
};

/** One outstanding invoice, at the detail needed to chase it. */
export type AgingInvoiceRow = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  /** The date the invoice was raised. */
  invoiceDate: string;
  sentAt: string | null;
  /** Sent date plus the org's payment terms; null until it is sent. */
  dueDate: string | null;
  /** Days since it was sent -- the client's clock, not ours. */
  days: number;
  /** Days past the due date. Zero when it is not yet due. */
  daysOverdue: number;
  total: number;
  paid: number;
  balance: number;
  bucket: AgingBucket;
  status: string;
};

export type AgingReport = {
  rows: AgingRow[];
  totals: Record<AgingBucket, number> & { total: number };
  invoices: AgingInvoiceRow[];
};

export function bucketFor(days: number): AgingBucket {
  if (days <= 30) return "current";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}

type AgingInput = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  status: string;
  totalAmount: number;
  sentAt: Date | null;
  issuedAt: Date | null;
  createdAt: Date;
  payments: { amount: number; receivedAt: Date; method: PaymentMethodValue; methodOther: string | null }[];
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function buildAging(
  invoices: AgingInput[],
  asOf: Date,
  paymentTermsDays = 30,
): AgingReport {
  const rows = new Map<string, AgingRow>();
  const totals = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
  const detail: AgingReport["invoices"] = [];

  for (const inv of invoices) {
    const s = settle(inv.totalAmount, inv.payments);
    if (s.balance <= 0) continue;

    const since = inv.sentAt ?? inv.issuedAt ?? inv.createdAt;
    const days = Math.max(0, Math.floor((asOf.getTime() - since.getTime()) / 86_400_000));
    const bucket = bucketFor(days);

    const row =
      rows.get(inv.clientId) ??
      {
        clientId: inv.clientId,
        name: inv.clientName,
        current: 0,
        d31_60: 0,
        d61_90: 0,
        d90plus: 0,
        total: 0,
        oldestDays: 0,
      };
    row[bucket] += s.balance;
    row.total += s.balance;
    row.oldestDays = Math.max(row.oldestDays, days);
    rows.set(inv.clientId, row);

    totals[bucket] += s.balance;
    totals.total += s.balance;

    // Due only once it has actually been sent: an invoice sitting unsent is
    // not late, it is unsent, and calling it overdue blames the client for
    // something on our side of the desk.
    const dueDate = inv.sentAt
      ? new Date(inv.sentAt.getTime() + paymentTermsDays * 86_400_000)
      : null;

    detail.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientId: inv.clientId,
      clientName: inv.clientName,
      invoiceDate: iso(inv.issuedAt ?? inv.createdAt)!,
      sentAt: iso(inv.sentAt),
      dueDate: iso(dueDate),
      days,
      daysOverdue: dueDate
        ? Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000))
        : 0,
      total: inv.totalAmount,
      paid: s.received,
      balance: s.balance,
      bucket,
      status: inv.status,
    });
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    // Worst first: the point of an ageing report is what to chase.
    rows: [...rows.values()]
      .map((r) => ({
        ...r,
        current: round(r.current),
        d31_60: round(r.d31_60),
        d61_90: round(r.d61_90),
        d90plus: round(r.d90plus),
        total: round(r.total),
      }))
      .sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total),
    totals: {
      current: round(totals.current),
      d31_60: round(totals.d31_60),
      d61_90: round(totals.d61_90),
      d90plus: round(totals.d90plus),
      total: round(totals.total),
    },
    invoices: detail.sort((a, b) => b.days - a.days),
  };
}

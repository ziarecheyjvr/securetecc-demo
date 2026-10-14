import type { PaymentMethodValue } from "@/lib/payment-methods";

/**
 * How an invoice stands once its payments are counted.
 *
 * The invoice row keeps `paidAt` and `paymentMethod` as a summary, but the
 * payments are the truth: a $2,000 invoice with $1,000 received is neither
 * "paid" nor "nothing has happened", and a single flag cannot say so.
 */
export type PaymentLike = {
  amount: number;
  receivedAt: Date;
  method: PaymentMethodValue;
  methodOther?: string | null;
};

export type SettlementState = "Unpaid" | "PartPaid" | "Paid" | "Overpaid";

export type Settlement = {
  total: number;
  received: number;
  /** What is still owed. Never negative -- an overpayment is its own state. */
  balance: number;
  state: SettlementState;
  /** The date the invoice became fully covered, or null while it is not. */
  settledOn: Date | null;
  /** Method of the largest payment -- what "how did they pay this" means when
   *  an invoice was settled in more than one go. */
  principalMethod: PaymentMethodValue | null;
};

/** Cents, to keep float addition from leaving a $0.004 balance behind. */
const cents = (n: number) => Math.round(n * 100);

export function settle(total: number, payments: PaymentLike[]): Settlement {
  const totalCents = cents(total);
  const receivedCents = payments.reduce((s, p) => s + cents(p.amount), 0);

  // Chronological, so "settled on" is the payment that crossed the line, not
  // whichever row happens to be last in the query.
  const ordered = [...payments].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  let running = 0;
  let settledOn: Date | null = null;
  for (const p of ordered) {
    running += cents(p.amount);
    if (running >= totalCents && totalCents > 0) {
      settledOn = p.receivedAt;
      break;
    }
  }

  const principal =
    payments.length === 0
      ? null
      : [...payments].sort((a, b) => cents(b.amount) - cents(a.amount))[0];

  const state: SettlementState =
    receivedCents === 0
      ? "Unpaid"
      : receivedCents > totalCents
        ? "Overpaid"
        : receivedCents >= totalCents
          ? "Paid"
          : "PartPaid";

  return {
    total,
    received: receivedCents / 100,
    balance: Math.max(0, (totalCents - receivedCents) / 100),
    state,
    settledOn,
    principalMethod: principal?.method ?? null,
  };
}

export const SETTLEMENT_LABELS: Record<SettlementState, string> = {
  Unpaid: "Unpaid",
  PartPaid: "Part paid",
  Paid: "Paid",
  Overpaid: "Overpaid",
};

/** "Other (bank transfer)" -- the free text is only meaningful for Other. */
export function methodLabel(method: string, other?: string | null): string {
  return method === "Other" && other?.trim() ? `Other (${other.trim()})` : method;
}

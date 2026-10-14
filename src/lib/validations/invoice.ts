import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

// Period selection used to be locked to a single calendar month, which
// removed all ambiguity from "does this Monthly charge apply?" and the
// Annual-in-January gate. It's now an arbitrary [periodStart, periodEnd]
// range (presets like "past 6 months" or a custom range) -- the ambiguity
// that constraint prevented is instead resolved by billing each Monthly
// recurring charge once per calendar month the range touches (and each
// Annual charge once per January it touches), tracked per-occurrence on
// InvoiceRecurringCharge.periodStart/periodEnd so a charge can never be
// double-billed across two invoices with different period granularities.
export const invoicePeriodSchema = z
  .object({
    clientId: z.string().min(1, "Select a client"),
    periodStart: isoDate,
    periodEnd: isoDate,
    // Off by default: an invoice lists what is owed. Turned on, the period's
    // non-billable work is offered for selection too, so the client can see
    // the hours that were absorbed rather than only the ones they pay for.
    includeNonBillable: z.boolean().default(false),
  })
  .refine((v) => v.periodStart <= v.periodEnd, {
    message: "Start date must be before the end date",
    path: ["periodEnd"],
  });

export type InvoicePeriodValues = z.infer<typeof invoicePeriodSchema>;

export const generateInvoiceSchema = z
  .object({
    clientId: z.string().min(1),
    periodStart: isoDate,
    periodEnd: isoDate,
    timeEntryIds: z.array(z.string()),
    // Composite `${recurringChargeId}:${occurrencePeriodStart}` ids -- see
    // loadBillingCandidates. The server never trusts the embedded date; it
    // re-derives every occurrence's period from scratch and only uses the
    // submitted ids as a selection filter (same principle as time entries).
    recurringChargeOccurrenceIds: z.array(z.string()),
    reimbursableExpenseIds: z.array(z.string()),
    /** Must match the review screen's toggle, or the re-verification below
     *  will not find the non-billable entries the user selected. */
    includeNonBillable: z.boolean().default(false),
  })
  .refine((v) => v.periodStart <= v.periodEnd, {
    message: "Start date must be before the end date",
    path: ["periodEnd"],
  });

export type GenerateInvoiceValues = z.infer<typeof generateInvoiceSchema>;

/** Parses a "YYYY-MM-DD" into a UTC Date at midnight. */
export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** First/last instant of the given YYYY-MM, in UTC. */
export function monthBounds(year: number, month0: number): { monthStart: Date; monthEnd: Date } {
  return {
    monthStart: new Date(Date.UTC(year, month0, 1)),
    // Day 0 of the next month == last day of this one.
    monthEnd: new Date(Date.UTC(year, month0 + 1, 0)),
  };
}

/**
 * Every calendar month (UTC) whose span overlaps [periodStart, periodEnd],
 * in order. A custom range doesn't have to land on month boundaries --
 * "Jan 15 to Mar 10" still touches January, February, and March, and each
 * one counts as a full billing cycle for a Monthly recurring charge (same
 * overlap semantics periodTouchesJanuary already used, generalized to every
 * month instead of just January).
 */
export function monthsInRange(
  periodStart: Date,
  periodEnd: Date,
): { monthStart: Date; monthEnd: Date }[] {
  const months: { monthStart: Date; monthEnd: Date }[] = [];
  let year = periodStart.getUTCFullYear();
  let month0 = periodStart.getUTCMonth();
  const endYear = periodEnd.getUTCFullYear();
  const endMonth0 = periodEnd.getUTCMonth();

  while (year < endYear || (year === endYear && month0 <= endMonth0)) {
    months.push(monthBounds(year, month0));
    month0 += 1;
    if (month0 > 11) {
      month0 = 0;
      year += 1;
    }
  }
  return months;
}

/** Same as monthsInRange, filtered to January occurrences only -- Annual
 * charges bill once per January the range touches, never per calendar month. */
export function januaryOccurrencesInRange(
  periodStart: Date,
  periodEnd: Date,
): { monthStart: Date; monthEnd: Date }[] {
  return monthsInRange(periodStart, periodEnd).filter((m) => m.monthStart.getUTCMonth() === 0);
}

/** True if [periodStart, periodEnd] touches at least one January. */
export function periodTouchesJanuary(periodStart: Date, periodEnd: Date): boolean {
  return januaryOccurrencesInRange(periodStart, periodEnd).length > 0;
}

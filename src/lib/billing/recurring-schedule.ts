import type { BillingFrequency } from "@/generated/prisma/enums";

/**
 * When a recurring charge is next due to be billed.
 *
 * Derived rather than stored: a stored "next billing date" is a value that
 * silently goes stale the moment nobody advances it, and there is nothing in
 * the schedule a start date and a frequency do not already say.
 *
 * Monthly repeats on the start date's day of the month; Annual repeats on its
 * month and day -- which for the charges here means January, matching how the
 * invoice generator bills annual lines.
 */
export function nextBillingDate(args: {
  startDate: Date | null;
  frequency: BillingFrequency;
  activeStatus: boolean;
  asOf: Date;
}): Date | null {
  if (!args.activeStatus || !args.startDate) return null;

  const start = args.startDate;
  const asOf = args.asOf;
  if (start > asOf) return start;

  if (args.frequency === "Annual") {
    const thisYear = new Date(
      Date.UTC(asOf.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    return thisYear >= asOf
      ? thisYear
      : new Date(Date.UTC(asOf.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()));
  }

  // Monthly. Clamping to the last day keeps a charge that started on the 31st
  // from silently landing in the following month every February.
  const day = start.getUTCDate();
  const candidate = (year: number, month: number) => {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
  };

  const thisMonth = candidate(asOf.getUTCFullYear(), asOf.getUTCMonth());
  return thisMonth >= asOf
    ? thisMonth
    : candidate(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1);
}

/** What the charge earns above what it costs to deliver, per period. */
export function marginOf(amount: number, cost: number | null): number | null {
  return cost === null ? null : Math.round((amount - cost) * 100) / 100;
}

/**
 * "YYYY-MM" month helpers for reports that page by calendar month.
 */

/** Date-only bounds of a month: start inclusive, end exclusive. Null if malformed. */
export function monthBounds(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  // Date-only bounds, matching how time_entries.date is stored. Prisma sends
  // these as DATE parameters, so this is a calendar comparison with no
  // timezone in it at all -- which is what "the month it was worked" means.
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

export function monthLabelOf(month: string): string {
  const bounds = monthBounds(month);
  if (!bounds) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(bounds.start);
}

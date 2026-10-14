/**
 * Shared date-range preset resolver for list-filter UIs (currently Time
 * Entries). Server-safe pure functions -- no "use client" needed.
 */

export const DATE_RANGE_PRESETS = [
  "all",
  "this-month",
  "last-month",
  "this-year",
  "custom",
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  all: "All time",
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
  custom: "Custom range",
};

export function isDateRangePreset(value: string | undefined): value is DateRangePreset {
  return DATE_RANGE_PRESETS.includes(value as DateRangePreset);
}

/**
 * Resolves a preset (or an explicit custom start/end pair) to a concrete
 * [gte, lte] Date range, in UTC. Returns null for "all" (no filter) and for
 * "custom" with a missing/invalid start or end -- callers should fall back to
 * no filter in that case rather than erroring, since this drives read-only
 * list filtering, not a required input.
 */
export function resolveDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
): { gte: Date; lte: Date } | null {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  switch (preset) {
    case "all":
      return null;
    case "this-month":
      return { gte: new Date(Date.UTC(y, m, 1)), lte: new Date(Date.UTC(y, m + 1, 0)) };
    case "last-month":
      return { gte: new Date(Date.UTC(y, m - 1, 1)), lte: new Date(Date.UTC(y, m, 0)) };
    case "this-year":
      return { gte: new Date(Date.UTC(y, 0, 1)), lte: new Date(Date.UTC(y, 11, 31)) };
    case "custom": {
      if (!customStart || !customEnd) return null;
      const gte = new Date(customStart);
      const lte = new Date(customEnd);
      if (Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime())) return null;
      return { gte, lte };
    }
  }
}

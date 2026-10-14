import type { ServiceArea } from "@/generated/prisma/enums";

/**
 * On-site billing: a minimum on the work, plus the travel.
 *
 * Inside the normal service area an on-site visit bills a one-hour minimum
 * and one way of the travel. Outside it, the job has to be worth the drive:
 * a two-hour minimum, and travel both ways.
 *
 * The rule is applied to what gets BILLED. The entry keeps the hours actually
 * worked and the travel actually driven as separate values, so changing this
 * rule later cannot rewrite the record of what happened.
 */
export type TravelRule = {
  minimumHours: number;
  /** 1 for one way, 2 for return. */
  travelMultiplier: number;
};

export const TRAVEL_RULES: Record<ServiceArea, TravelRule> = {
  InArea: { minimumHours: 1, travelMultiplier: 1 },
  OutOfArea: { minimumHours: 2, travelMultiplier: 2 },
};

export const SERVICE_AREA_LABELS: Record<ServiceArea, string> = {
  InArea: "In service area",
  OutOfArea: "Outside service area",
};

/**
 * Billable hours for an entry, given the work, the travel, and the minimum
 * the service type already imposes.
 *
 * The larger of the two minimums wins: a service type that already demands
 * two hours is not softened by an in-area visit.
 */
export function billableHours(args: {
  workedHours: number;
  travelMinutes: number | null;
  serviceTypeMinimumHours: number;
  serviceArea: ServiceArea;
  /** Only on-site work bills travel; remote and phone work has none. */
  isOnSite: boolean;
}): { hours: number; travelHours: number; minimumApplied: number } {
  const rule = TRAVEL_RULES[args.serviceArea];
  const minimum = args.isOnSite
    ? Math.max(args.serviceTypeMinimumHours, rule.minimumHours)
    : args.serviceTypeMinimumHours;

  const work = Math.max(args.workedHours, minimum);
  const travelHours =
    args.isOnSite && args.travelMinutes
      ? Number(((args.travelMinutes / 60) * rule.travelMultiplier).toFixed(2))
      : 0;

  return {
    hours: Number((work + travelHours).toFixed(2)),
    travelHours,
    minimumApplied: minimum,
  };
}

/** On-site service types carry an O- code; that is how the sheet named them. */
export function isOnSiteCode(code: string): boolean {
  return /^o-/i.test(code.trim());
}

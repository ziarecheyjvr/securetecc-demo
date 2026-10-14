import type { AddonItemType } from "@/generated/prisma/enums";

/**
 * The order recurring services are listed in on a client record.
 *
 * Alphabetical is the wrong order here: it put "Antivirus" above the site fee
 * and buried RMM in the middle. Tony reads a client record top-down and wants
 * the services that carry the relationship first -- site fee, then RMM, then
 * email security -- with everything else after.
 *
 * Charges imported from the master sheet have no itemType, so the description
 * is matched as a fallback. That is a guess, and it is deliberately only a
 * fallback: setting the type on the charge is what makes the order certain.
 */
const CATEGORY_RANK: Record<AddonItemType, number> = {
  SiteFee: 0,
  RMM: 1,
  RemoteMonitoring: 1, // the same service under its older name
  EmailSecurity: 2,
  DMARC: 2, // DMARC is email security; they sort together
  MonitoringSeat: 3,
  Other: 4,
};

const DESCRIPTION_HINTS: [RegExp, number][] = [
  [/\bsite\s*fee\b|\bbase\s*fee\b/i, 0],
  [/\brmm\b|remote\s*monitor|\bmonitoring\b/i, 1],
  [/\bdmarc\b|email\s*(security|protection)|\bspam\b|\bproofpoint\b/i, 2],
];

const UNRANKED = 5;

export function recurringRank(charge: {
  itemType: AddonItemType | null;
  description: string;
}): number {
  if (charge.itemType) return CATEGORY_RANK[charge.itemType];
  for (const [pattern, rank] of DESCRIPTION_HINTS) {
    if (pattern.test(charge.description)) return rank;
  }
  return UNRANKED;
}

/** Sorts in place-safe fashion: by category, then description within it. */
export function sortRecurring<T extends { itemType: AddonItemType | null; description: string }>(
  charges: T[],
): T[] {
  return [...charges].sort(
    (a, b) => recurringRank(a) - recurringRank(b) || a.description.localeCompare(b.description),
  );
}

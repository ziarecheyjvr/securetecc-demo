/**
 * What one hour of this entry is worth.
 *
 * Three sources, most specific first:
 *
 *  1. The ENTRY's own rate. Tony asked to be able to change a rate on the fly
 *     rather than have it locked to the client record -- a job quoted
 *     differently is a property of that job, not of the relationship.
 *  2. The SERVICE TYPE's override (Low Voltage, on-site) -- or its scheduled
 *     replacement, once the entry's date reaches it.
 *  3. The CLIENT's standard rate -- or their scheduled replacement, same rule.
 *
 * Scheduled rates exist so an agreed change lands by itself. The January 2027
 * card is $125 remote and $150 on-site: the standard sits on every client and
 * the on-site figure on the service type, both dated, and neither requires
 * anyone to edit thirty records on the morning it starts. Back-dated entries
 * written after the change still bill at the rate that applied on the day the
 * work was done -- which is why every one of these is decided by the ENTRY's
 * date and never by today's.
 */
export type RateInputs = {
  entryRateOverride: number | null;
  serviceTypeRateOverride: number | null;
  serviceTypeScheduledRate?: number | null;
  serviceTypeScheduledRateFrom?: Date | null;
  clientBillingRate: number | null;
  clientScheduledRate: number | null;
  clientScheduledRateFrom: Date | null;
  /** The date the work was done. */
  entryDate: Date;
};

/**
 * Whether a scheduled rate has taken effect for this entry.
 *
 * Both values are date-only, stored at UTC midnight, so a plain comparison is
 * a calendar comparison -- an entry dated 1 January is in, one dated
 * 31 December is not.
 */
function scheduledApplies(rate: number | null | undefined, from: Date | null | undefined, entryDate: Date): boolean {
  return rate !== null && rate !== undefined && !!from && entryDate.getTime() >= from.getTime();
}

export function resolveRate(input: RateInputs): number | null {
  if (input.entryRateOverride !== null) return input.entryRateOverride;

  // The service type's own schedule beats its current override, and both beat
  // anything on the client: on-site is $150 in January whatever the client's
  // standard rate becomes.
  if (
    scheduledApplies(
      input.serviceTypeScheduledRate,
      input.serviceTypeScheduledRateFrom,
      input.entryDate,
    )
  ) {
    return input.serviceTypeScheduledRate as number;
  }
  if (input.serviceTypeRateOverride !== null) return input.serviceTypeRateOverride;

  if (scheduledApplies(input.clientScheduledRate, input.clientScheduledRateFrom, input.entryDate)) {
    return input.clientScheduledRate as number;
  }

  return input.clientBillingRate;
}

/** Prisma Decimal | number | null -> number | null, without turning null into 0. */
export function toRate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

import { prisma } from "@/lib/db/prisma";
import { PACIFIC_TZ, pacificNow, type Schedule } from "./pacific";

/**
 * Decides whether a cron firing should actually do the work, and claims it.
 *
 * Replaces the old exact-hour gate. That gate asked "is it exactly 8am
 * Pacific?", which meant the second of the two candidate UTC hours -- there to
 * absorb the DST offset -- was rejected for being an hour late. So when the
 * primary firing was missed (a deployment landed in the same second on
 * 2026-08-24), nothing picked it up and the week's digest vanished silently.
 *
 * Now the question is "has this occurrence been handled yet, and is it at or
 * shortly after the scheduled time?" The second candidate hour becomes a real
 * retry rather than a no-op.
 *
 * The claim is the INSERT itself. A unique constraint on
 * (jobName, periodKey) means a duplicate fails at the database, so two
 * firings racing each other can't both win -- there's no read-then-write
 * window to lose.
 */

/** How long after the scheduled hour a firing may still claim the occurrence. */
const CATCH_UP_HOURS = 3;

export type ClaimResult =
  | { run: true; periodKey: string }
  | { run: false; reason: string; periodKey: string };

/** The Pacific calendar date a firing belongs to, as YYYY-MM-DD. */
function periodKeyFor(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(at);
}

export async function claimCronRun(
  jobName: string,
  schedule: Schedule,
  at: Date = new Date(),
): Promise<ClaimResult> {
  const now = pacificNow(at);
  const periodKey = periodKeyFor(at);

  // Day filters first -- they're what make the date alone a sufficient key.
  if (schedule.weekdays && !schedule.weekdays.includes(now.weekday)) {
    return { run: false, reason: `Not a scheduled weekday (Pacific ${periodKey})`, periodKey };
  }
  if (schedule.dayOfMonth !== undefined && now.day !== schedule.dayOfMonth) {
    return { run: false, reason: `Not day ${schedule.dayOfMonth} of the month`, periodKey };
  }

  if (now.hour < schedule.hour) {
    return { run: false, reason: `Too early (now ${now.hour}:00 PT, due ${schedule.hour}:00 PT)`, periodKey };
  }
  // Bounded so a stray invocation at some unrelated hour can't claim the day.
  // Only needs to span the DST offset plus a retry, not the whole day.
  if (now.hour >= schedule.hour + CATCH_UP_HOURS) {
    return {
      run: false,
      reason: `Too late (now ${now.hour}:00 PT, due ${schedule.hour}:00 PT)`,
      periodKey,
    };
  }

  try {
    await prisma.cronRun.create({ data: { jobName, periodKey } });
    return { run: true, periodKey };
  } catch {
    // Unique violation: an earlier firing already handled this occurrence.
    return { run: false, reason: `Already ran for ${periodKey}`, periodKey };
  }
}

/** Body for a firing that decided not to work. Always 200 -- a skip isn't a failure. */
export function skippedResponse(job: string, result: Extract<ClaimResult, { run: false }>) {
  return { ok: true, skipped: true, job, periodKey: result.periodKey, reason: result.reason };
}

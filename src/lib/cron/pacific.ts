/**
 * Pacific-time gating for scheduled jobs.
 *
 * Vercel Cron only accepts UTC expressions, so a fixed UTC schedule drifts an
 * hour twice a year when Pacific switches between PST (UTC-8) and PDT (UTC-7).
 * A job meant for 7pm Pacific would fire at 6pm for half the year.
 *
 * The fix is two-sided:
 *   1. vercel.json fires each job at BOTH candidate UTC hours, so one of them
 *      is always the correct Pacific local time whatever the current offset.
 *   2. Each route calls shouldRunNow() and no-ops on the wrong one.
 *
 * Everything below derives the local time from Intl with an explicit
 * timeZone rather than from a fixed offset, so DST transition dates come from
 * the runtime's tz database instead of being hard-coded and going stale.
 */
export const PACIFIC_TZ = "America/Los_Angeles";

export type PacificNow = {
  /** 0-23, local Pacific */
  hour: number;
  /** 1-31, local Pacific */
  day: number;
  /** 0 = Sunday … 6 = Saturday, local Pacific */
  weekday: number;
};

export function pacificNow(at: Date = new Date()): PacificNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "2-digit",
    hour12: false,
    day: "2-digit",
    weekday: "short",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    // "24" is a legal hour12:false rendering of midnight in some ICU versions.
    hour: Number(get("hour")) % 24,
    day: Number(get("day")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

export type Schedule = {
  /** Local Pacific hour the job is meant to run at. */
  hour: number;
  /** Restrict to these local weekdays (0=Sun). Omit for any day. */
  weekdays?: number[];
  /** Restrict to this local day-of-month. Omit for any day. */
  dayOfMonth?: number;
};

/**
 * True only when the current Pacific local time matches the intended
 * schedule. Weekday and day-of-month are evaluated in Pacific too -- checking
 * them in UTC would pick the wrong day for anything scheduled near midnight.
 */
export function shouldRunNow(schedule: Schedule, at: Date = new Date()): boolean {
  const now = pacificNow(at);
  if (now.hour !== schedule.hour) return false;
  if (schedule.weekdays && !schedule.weekdays.includes(now.weekday)) return false;
  if (schedule.dayOfMonth !== undefined && now.day !== schedule.dayOfMonth) return false;
  return true;
}

/** Response for a run that fired on the off-hour UTC trigger. */
export function skippedResponse(schedule: Schedule, at: Date = new Date()) {
  const now = pacificNow(at);
  return {
    ok: true,
    skipped: true,
    reason: `Not the scheduled Pacific time (now ${now.hour}:00 PT, scheduled ${schedule.hour}:00 PT).`,
  };
}

/** The Pacific calendar date `at` falls on. */
function pacificYmd(at: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/**
 * UTC instant of Pacific midnight on a given Pacific calendar date.
 *
 * Pacific is UTC-7 or UTC-8 depending on DST, and which applies depends on the
 * very date being resolved -- so guess with the larger offset, read back what
 * that instant actually is in Pacific, and correct if we overshot.
 */
export function pacificMidnight(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, 8, 0, 0, 0));
  const back = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ, day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(guess);
  const hour = Number(back.find((p) => p.type === "hour")!.value) % 24;
  // hour 1 means we landed at 01:00 PDT, an hour past midnight -> pull back.
  return hour === 1 ? new Date(guess.getTime() - 3_600_000) : guess;
}

/**
 * UTC instant of Pacific midnight for the day `at` falls on.
 *
 * "Did I log time today?" has to be asked in the timezone the person lives in.
 * Using `setUTCHours(0,0,0,0)` instead looks right but silently isn't: at 7pm
 * Pacific the UTC date has already rolled to tomorrow, so UTC midnight is 5pm
 * Pacific *today* -- work logged that morning falls outside the window and the
 * answer comes back "no" for someone who logged at 10am.
 */
export function pacificDayStart(at: Date = new Date()): Date {
  const { y, m, d } = pacificYmd(at);
  return pacificMidnight(y, m, d);
}

/** UTC instant of Pacific midnight on the 1st of `at`'s Pacific month. */
export function pacificMonthStart(at: Date = new Date()): Date {
  const { y, m } = pacificYmd(at);
  return pacificMidnight(y, m, 1);
}

/**
 * Start of each of the last `count` Pacific months, oldest first.
 *
 * Month arithmetic runs on the Pacific calendar (integers), never by shifting a
 * UTC instant: Aug 1 00:00 PDT is 07:00Z, and 07:00Z in March is 11pm the
 * PREVIOUS day, so shifting the instant back five months lands in February.
 */
export function pacificMonthStartsBack(count: number, at: Date = new Date()): Date[] {
  const { y, m } = pacificYmd(at);
  const out: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    out.push(pacificMidnight(Math.floor(total / 12), (total % 12) + 1, 1));
  }
  return out;
}

import { PACIFIC_TZ } from "@/lib/cron/pacific";

/**
 * The dashboard greeting: time of day, birthdays and US holidays.
 *
 * Everything is evaluated in PACIFIC local time, derived from Intl with an
 * explicit timeZone rather than a fixed offset. That is what makes it correct
 * across PST and PDT without knowing which is in force: the runtime's tz
 * database supplies the offset, so the March and November transitions are
 * handled by data rather than by hard-coded dates that go stale.
 *
 * It matters here more than it looks. On Vercel the server clock is UTC, so
 * at 6pm Pacific it is already tomorrow in UTC -- a greeting computed from
 * server-local time would say "good morning" during Tony's evening, and would
 * wish him happy birthday a day early every year.
 */

export type PacificDate = {
  /** 0-23 */
  hour: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  year: number;
};

/** Full Pacific calendar/clock breakdown. */
export function pacificDate(at: Date = new Date()): PacificDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    // "24" is a legal hour12:false rendering of midnight in some ICU versions.
    hour: Number(get("hour")) % 24,
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdays.indexOf(get("weekday")),
    year: Number(get("year")),
  };
}

/** Which PST/PDT is currently in force, for display. */
export function pacificAbbreviation(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    timeZoneName: "short",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "PT";
}

/**
 * "Wednesday, August 26", in Pacific.
 *
 * A module-level formatter rather than one built per render: Intl.DateTimeFormat
 * construction is the expensive part, and this one has no per-call variation.
 */
export const PACIFIC_LONG_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
});

export type TimeOfDay = "morning" | "afternoon" | "evening";

/**
 * Boundaries at noon and 5pm.
 *
 * 5pm rather than 6pm because "good evening" at the end of a working day
 * reads naturally, whereas "good afternoon" at half five does not.
 */
export function timeOfDay(hour: number): TimeOfDay {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

// --------------------------------------------------------------- holidays

/** nth weekday of a month, e.g. the 4th Thursday of November. */
function nthWeekdayOf(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (weekday - first + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/** Last given weekday of a month, e.g. the last Monday of May. */
function lastWeekdayOf(year: number, month: number, weekday: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay();
  return daysInMonth - ((last - weekday + 7) % 7);
}

export type Holiday = { name: string; greeting: string };

/**
 * The US holiday, if today is one.
 *
 * Fixed-date holidays are a lookup; the movable ones are computed from the
 * year, so Thanksgiving is right in 2027 without anyone updating a table.
 *
 * Deliberately limited to days a greeting genuinely suits. Memorial Day and
 * Veterans Day are commemorative -- "Happy Memorial Day" is the wrong
 * register for a day of remembrance -- so they're worded as observances
 * rather than celebrations, and days like Columbus Day are left out
 * altogether rather than greeted awkwardly.
 */
export function holidayFor(d: PacificDate): Holiday | null {
  const { year, month, day } = d;

  const fixed: Record<string, Holiday> = {
    "1-1": { name: "New Year's Day", greeting: "Happy New Year" },
    "2-14": { name: "Valentine's Day", greeting: "Happy Valentine's Day" },
    "6-19": { name: "Juneteenth", greeting: "Happy Juneteenth" },
    "7-4": { name: "Independence Day", greeting: "Happy 4th of July" },
    "10-31": { name: "Halloween", greeting: "Happy Halloween" },
    "11-11": { name: "Veterans Day", greeting: "Honoring our veterans today" },
    "12-24": { name: "Christmas Eve", greeting: "Merry Christmas Eve" },
    "12-25": { name: "Christmas Day", greeting: "Merry Christmas" },
    "12-31": { name: "New Year's Eve", greeting: "Happy New Year's Eve" },
  };

  const hit = fixed[`${month}-${day}`];
  if (hit) return hit;

  // Movable feasts, computed rather than tabulated.
  if (month === 1 && day === nthWeekdayOf(year, 1, 1, 3)) {
    return { name: "Martin Luther King Jr. Day", greeting: "Honoring Dr. King today" };
  }
  if (month === 2 && day === nthWeekdayOf(year, 2, 1, 3)) {
    return { name: "Presidents' Day", greeting: "Happy Presidents' Day" };
  }
  if (month === 5 && day === nthWeekdayOf(year, 5, 0, 2)) {
    return { name: "Mother's Day", greeting: "Happy Mother's Day" };
  }
  if (month === 5 && day === lastWeekdayOf(year, 5, 1)) {
    return { name: "Memorial Day", greeting: "Remembering the fallen today" };
  }
  if (month === 6 && day === nthWeekdayOf(year, 6, 0, 3)) {
    return { name: "Father's Day", greeting: "Happy Father's Day" };
  }
  if (month === 9 && day === nthWeekdayOf(year, 9, 1, 1)) {
    return { name: "Labor Day", greeting: "Happy Labor Day" };
  }
  if (month === 11 && day === nthWeekdayOf(year, 11, 4, 4)) {
    return { name: "Thanksgiving", greeting: "Happy Thanksgiving" };
  }
  // The Friday after Thanksgiving -- a working day for most, but worth a nod.
  if (month === 11 && day === nthWeekdayOf(year, 11, 4, 4) + 1) {
    return { name: "Day after Thanksgiving", greeting: "Hope you got some rest" };
  }

  return null;
}

export type Greeting = {
  /** The line shown as the page heading. */
  headline: string;
  /** Secondary line, or null when there is nothing extra worth saying. */
  subline: string | null;
  /** What drove the headline, for tests and for the UI's emphasis. */
  kind: "birthday" | "holiday" | "time";
  timeOfDay: TimeOfDay;
};

const TIME_LABEL: Record<TimeOfDay, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/**
 * Builds the greeting.
 *
 * Precedence is birthday > holiday > time of day, and it is a precedence
 * rather than a concatenation: "Good morning and happy birthday and merry
 * Christmas, Tony" is worse than picking the one that matters most. What
 * loses out moves to the subline, so a birthday on Christmas Day still
 * mentions Christmas.
 */
export function buildGreeting(args: {
  firstName: string;
  birthMonth: number | null;
  birthDay: number | null;
  organizationName: string;
  at?: Date;
}): Greeting {
  const d = pacificDate(args.at ?? new Date());
  const tod = timeOfDay(d.hour);
  const holiday = holidayFor(d);
  const isBirthday =
    args.birthMonth !== null &&
    args.birthDay !== null &&
    args.birthMonth === d.month &&
    args.birthDay === d.day;

  if (isBirthday) {
    return {
      headline: `Happy birthday, ${args.firstName}!`,
      subline: holiday
        ? `${holiday.greeting}, too — sharing your day with ${holiday.name}.`
        : `Hope you get a good one. Here's what's happening at ${args.organizationName}.`,
      kind: "birthday",
      timeOfDay: tod,
    };
  }

  if (holiday) {
    return {
      headline: `${holiday.greeting}, ${args.firstName}`,
      subline: `Here's what's happening at ${args.organizationName}.`,
      kind: "holiday",
      timeOfDay: tod,
    };
  }

  return {
    headline: `${TIME_LABEL[tod]}, ${args.firstName}`,
    subline: `Here's what's happening at ${args.organizationName}.`,
    kind: "time",
    timeOfDay: tod,
  };
}

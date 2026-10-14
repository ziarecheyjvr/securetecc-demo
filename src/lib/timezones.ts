/**
 * Converting a wall-clock time in one zone to another.
 *
 * Everything here derives offsets from `Intl` with an explicit timeZone, so
 * the DST transition dates come from the runtime's tz database rather than
 * from arithmetic that goes stale the year a government moves the dates.
 *
 * The case this exists for: Pacific observes daylight saving and Manila does
 * not. The gap between them is therefore NOT a constant -- 15 hours from
 * March to November, 16 hours from November to March. A team split across the
 * two cannot be shown with a fixed offset without being wrong for half the
 * year, and wrong in the direction that makes people miss each other.
 */

export const PACIFIC = "America/Los_Angeles";
export const MANILA = "Asia/Manila";

/** Zones offered when someone sets where they work from. */
export const TEAM_TIME_ZONES = [
  { id: PACIFIC, label: "Pacific — Los Angeles" },
  { id: MANILA, label: "Philippines — Manila" },
  { id: "America/Denver", label: "Mountain — Denver" },
  { id: "America/Chicago", label: "Central — Chicago" },
  { id: "America/New_York", label: "Eastern — New York" },
  { id: "Europe/London", label: "UK — London" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Australia/Sydney", label: "Australia — Sydney" },
] as const;

export type TimeZoneId = string;

/** The parts of an instant as they read on a wall clock in `zone`. */
export function partsInZone(
  instant: Date,
  zone: TimeZoneId,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // "24" at midnight in some runtimes; %24 normalises it to 0.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

/**
 * How far `zone` is from UTC at a given instant, in minutes.
 *
 * Measured rather than looked up: format the same instant in the zone and in
 * UTC and take the difference. That is correct through a transition and for
 * half-hour and 45-minute zones alike.
 */
export function offsetMinutes(instant: Date, zone: TimeZoneId): number {
  const local = partsInZone(instant, zone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    0,
    0,
  );
  // Seconds and milliseconds are dropped on both sides, so compare the
  // instant with the same truncation.
  const truncated = Math.floor(instant.getTime() / 60_000) * 60_000;
  return (asUtc - truncated) / 60_000;
}

/**
 * The UTC instant at which the clock in `zone` reads the given wall time.
 *
 * Two passes: guess using the offset that applies at the naive instant, then
 * re-measure at the guess and correct. One correction is enough for every
 * real zone -- the second measurement is taken at an instant already within
 * an hour or two of the answer, on the correct side of any transition.
 *
 * A wall time that does not exist -- the hour skipped when clocks spring
 * forward -- has no instant to resolve to. Two passes alone land an hour
 * BEFORE the requested time, which reads as the appointment moving earlier.
 * The read-back below pushes it to the instant the clock jumped to instead:
 * 2:30am on a day that went 1:59 -> 3:00 becomes 3:30am, which is what a
 * person means by "the 2:30 slot" on that day.
 */
export function zonedWallTimeToUtc(
  zone: TimeZoneId,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstGuess = new Date(naive - offsetMinutes(new Date(naive), zone) * 60_000);
  const corrected = new Date(naive - offsetMinutes(firstGuess, zone) * 60_000);

  // Read back what that instant actually says on the clock. For every real
  // wall time it says exactly what was asked for and the drift is zero.
  const readBack = partsInZone(corrected, zone);
  const landedOn = Date.UTC(
    readBack.year,
    readBack.month - 1,
    readBack.day,
    readBack.hour,
    readBack.minute,
    0,
    0,
  );
  const drift = naive - landedOn;
  return drift === 0 ? corrected : new Date(corrected.getTime() + drift);
}

/**
 * Zones whose local abbreviation Intl will not produce.
 *
 * Intl gives a bare "GMT+8" for Manila and Singapore. Deriving initials from
 * the long name instead is worse, not better: "Philippine Standard Time"
 * initials to PST, which on a page comparing Manila with Pacific would put
 * the same three letters against both and mean opposite things. These are
 * spelled out, and only for zones somebody here actually works from.
 *
 * None of these observe daylight saving, so one value per zone is correct all
 * year -- a zone that switched would need the instant, and would get its
 * abbreviation from Intl anyway.
 */
const LOCAL_ABBREVIATIONS: Record<string, string> = {
  "Asia/Manila": "PHT",
  "Asia/Singapore": "SGT",
};

/** What the zone calls itself at that instant: "PDT", "PST", "PHT". */
export function zoneAbbreviation(instant: Date, zone: TimeZoneId): string {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;

  // Only override where Intl fell back to an offset -- a zone that has a real
  // abbreviation keeps the one the runtime knows, DST included.
  if (short && /^GMT/i.test(short)) return LOCAL_ABBREVIATIONS[zone] ?? short;
  return short ?? zone;
}

/** "9:00 AM" in the given zone. */
export function formatTimeInZone(instant: Date, zone: TimeZoneId): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

/** "Thu 10 Sep" in the given zone. */
export function formatDayInZone(instant: Date, zone: TimeZoneId): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
}

/**
 * The gap between two zones at an instant, in hours.
 *
 * Signed from the first zone's point of view: Manila against Pacific is +15
 * in summer and +16 in winter, because only one of the two moves.
 */
export function hoursBetween(instant: Date, from: TimeZoneId, to: TimeZoneId): number {
  return (offsetMinutes(instant, to) - offsetMinutes(instant, from)) / 60;
}

/** Minutes past midnight -> "9:00 AM", for a stored wall time. */
export function formatMinutes(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
}

/** "09:00" -> 540. Returns null for anything that isn't a wall time. */
export function parseMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** 540 -> "09:00", for an <input type="time">. */
export function toTimeInputValue(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

import {
  formatMinutes,
  formatTimeInZone,
  offsetMinutes,
  partsInZone,
  zoneAbbreviation,
  zonedWallTimeToUtc,
  type TimeZoneId,
} from "@/lib/timezones";

/**
 * A working week, resolved onto real dates so it can be read in any zone.
 *
 * The stored hours are wall-clock times in each person's own zone. Rendering
 * them somewhere else needs an actual date, because the answer depends on
 * whether either zone is on daylight saving that week -- which is exactly why
 * this resolves against a real calendar week rather than doing offset
 * arithmetic.
 */

export type AvailabilityKind = "Work" | "Commitment";

export type StoredBlock = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  label: string | null;
  /** Omitted means Work -- the default, and what every older row is. */
  kind?: AvailabilityKind;
};

/** A one-off change on one date, as stored. See AvailabilityException. */
export type StoredException = {
  id?: string;
  /** "YYYY-MM-DD" in the person's own zone. */
  date: string;
  kind: "Leave" | "Unavailable" | "DifferentHours" | "Blocked";
  startMinutes: number | null;
  endMinutes: number | null;
  note: string | null;
};

/** How an exception reads on the page: "On leave", "Blocked 2:00 PM – 4:00 PM". */
export function describeException(e: StoredException): string {
  const range =
    e.startMinutes != null && e.endMinutes != null
      ? `${formatMinutes(e.startMinutes)} – ${formatMinutes(e.endMinutes)}`
      : null;
  const base =
    e.kind === "Leave"
      ? "On leave"
      : e.kind === "Unavailable"
        ? range
          ? `Unavailable ${range}`
          : "Unavailable all day"
        : e.kind === "DifferentHours"
          ? `Working ${range ?? "different hours"}`
          : `Blocked ${range ?? ""}`.trim();
  return e.note ? `${base} — ${e.note}` : base;
}

/**
 * The usual blocks for one date, with that date's exceptions applied.
 *
 * Order matters: changed hours REPLACE the day, a whole-day absence then
 * clears it, and partial unavailability or blocked time is cut out of
 * whatever is left. Works in wall-clock minutes in the person's own zone, so
 * nothing here depends on either side's daylight saving.
 */
export function applyExceptions(
  weekday: number,
  usual: StoredBlock[],
  exceptions: StoredException[],
): StoredBlock[] {
  let day = usual;

  const replaced = exceptions.filter(
    (e) => e.kind === "DifferentHours" && e.startMinutes != null && e.endMinutes != null,
  );
  if (replaced.length > 0) {
    day = replaced.map((e) => ({
      weekday,
      startMinutes: e.startMinutes!,
      endMinutes: e.endMinutes!,
      label: e.note || "Changed hours",
    }));
  }

  if (exceptions.some((e) => e.kind === "Leave" || (e.kind === "Unavailable" && e.startMinutes == null))) {
    return [];
  }

  for (const e of exceptions) {
    if (e.kind !== "Unavailable" && e.kind !== "Blocked") continue;
    if (e.startMinutes == null || e.endMinutes == null) continue;
    const cutStart = e.startMinutes;
    const cutEnd = e.endMinutes <= e.startMinutes ? e.endMinutes + 1440 : e.endMinutes;

    day = day.flatMap((b) => {
      // An overnight block runs past 1440 here, so the cut compares on one line.
      const start = b.startMinutes;
      const end = b.endMinutes <= b.startMinutes ? b.endMinutes + 1440 : b.endMinutes;
      if (cutEnd <= start || cutStart >= end) return [b];
      const pieces: StoredBlock[] = [];
      if (cutStart > start) pieces.push({ ...b, startMinutes: start, endMinutes: cutStart % 1440 });
      if (cutEnd < end && cutEnd < 1440) pieces.push({ ...b, startMinutes: cutEnd, endMinutes: end % 1440 });
      return pieces;
    });
  }

  return day;
}

export type ResolvedBlock = {
  /** Work is ours; a Commitment is someone else's claim on the same hours. */
  kind: AvailabilityKind;
  /** As it reads on the person's own clock: "9:00 AM – 6:00 PM". */
  ownHours: string;
  /** The same block on the viewer's clock, which may land on another day. */
  viewerHours: string;
  /** Set when the block starts on a different day in the viewer's zone. */
  viewerDayNote: string | null;
  label: string | null;
  start: Date;
  end: Date;
};

export type TeamDay = {
  /** 0 = Sunday, in the PERSON'S zone -- the day they think of it as. */
  weekday: number;
  date: string;
  blocks: ResolvedBlock[];
  /** This date's one-off changes, described for display. */
  exceptions: string[];
};

export type TeamMember = {
  id: string;
  name: string;
  jobTitle: string | null;
  availabilityNote: string | null;
  /** When they go offline, in their words and in the viewer's. */
  offlineAfter: { own: string; viewer: string } | null;
  email: string;
  timeZone: TimeZoneId;
  /** "PDT", "GMT+8" -- what their zone calls itself right now. */
  zoneAbbr: string;
  /** Their local time right now. */
  localTime: string;
  localDay: string;
  /** Hours ahead (+) or behind (−) the viewer, right now. */
  hoursFromViewer: number;
  /** Working right now, by their own hours. */
  availableNow: boolean;
  /** When they next start, when they are not working now. */
  nextStart: { own: string; viewer: string; dayLabel: string } | null;
  days: TeamDay[];
  weeklyHours: number;
};

const DAY_MS = 86_400_000;

/** The Sunday that starts the week `at` falls in, as a date in `zone`. */
export function weekStartIn(at: Date, zone: TimeZoneId): { year: number; month: number; day: number } {
  const here = partsInZone(at, zone);
  const noon = Date.UTC(here.year, here.month - 1, here.day, 12, 0, 0, 0);
  const sunday = new Date(noon - here.weekday * DAY_MS);
  return {
    year: sunday.getUTCFullYear(),
    month: sunday.getUTCMonth() + 1,
    day: sunday.getUTCDate(),
  };
}

/** The calendar date `offset` days after a week start, as y/m/d. */
function dayFromWeekStart(
  weekStart: { year: number; month: number; day: number },
  offset: number,
): { year: number; month: number; day: number } {
  const noon = Date.UTC(weekStart.year, weekStart.month - 1, weekStart.day + offset, 12);
  const d = new Date(noon);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const isoDate = (p: { year: number; month: number; day: number }) =>
  `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;

export function buildMember(args: {
  user: {
    id: string;
    name: string;
    jobTitle: string | null;
    email: string;
    timeZone: string;
    offlineAfterMinutes?: number | null;
    availabilityNote?: string | null;
  };
  blocks: StoredBlock[];
  /** One-off changes by date. Omitted means the usual week applies. */
  exceptions?: StoredException[];
  /** The zone the person LOOKING at the page is in. */
  viewerZone: TimeZoneId;
  now: Date;
}): TeamMember {
  const { user, blocks, viewerZone, now } = args;
  const exceptions = args.exceptions ?? [];
  const zone = user.timeZone;

  // Their week, in their own zone -- Monday is whichever Monday it is where
  // they are, which on a Sunday evening in Manila is not the same date as it
  // is in California.
  const weekStart = weekStartIn(now, zone);

  const days: TeamDay[] = [];
  let weeklyMinutes = 0;

  for (let weekday = 0; weekday < 7; weekday++) {
    const date = dayFromWeekStart(weekStart, weekday);
    const dayExceptions = exceptions.filter((e) => e.date === isoDate(date));
    const dayBlocks = applyExceptions(
      weekday,
      blocks.filter((b) => b.weekday === weekday),
      dayExceptions,
    )
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map((b) => {
        const start = zonedWallTimeToUtc(
          zone,
          date.year,
          date.month,
          date.day,
          Math.floor(b.startMinutes / 60),
          b.startMinutes % 60,
        );
        // An end before the start is an overnight shift, so it belongs to the
        // following day -- 10pm to 6am is eight hours, not minus sixteen.
        const endsNextDay = b.endMinutes <= b.startMinutes;
        const endDate = endsNextDay ? dayFromWeekStart(weekStart, weekday + 1) : date;
        const end = zonedWallTimeToUtc(
          zone,
          endDate.year,
          endDate.month,
          endDate.day,
          Math.floor(b.endMinutes / 60),
          b.endMinutes % 60,
        );

        // Only our own hours count toward the week; a BBZ or Prodesign block
        // is drawn, but it is not time SecureTECC has.
        if ((b.kind ?? "Work") === "Work") {
          weeklyMinutes += (end.getTime() - start.getTime()) / 60_000;
        }

        // The viewer's calendar day for the start, compared with the
        // person's, so a block that lands "yesterday evening" says so.
        const ownDay = partsInZone(start, zone);
        const viewerDay = partsInZone(start, viewerZone);
        const ownIso = isoDate(ownDay);
        const viewerIso = isoDate(viewerDay);

        return {
          ownHours: `${formatMinutes(b.startMinutes)} – ${formatMinutes(b.endMinutes)}`,
          viewerHours: `${formatTimeInZone(start, viewerZone)} – ${formatTimeInZone(end, viewerZone)}`,
          viewerDayNote:
            viewerIso === ownIso
              ? null
              : viewerIso < ownIso
                ? "starts the day before"
                : "starts the next day",
          kind: b.kind ?? "Work",
          label: b.label,
          start,
          end,
        };
      });

    days.push({
      weekday,
      date: isoDate(date),
      blocks: dayBlocks,
      exceptions: dayExceptions.map(describeException),
    });
  }

  const allBlocks = days.flatMap((d) => d.blocks).filter((b) => b.kind === "Work");
  const availableNow = allBlocks.some((b) => now >= b.start && now < b.end);
  const upcoming = allBlocks
    .filter((b) => b.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  // Resolved against today so the viewer's side of it is right for the
  // season -- 11pm Manila is 8am Pacific in summer and 7am in winter.
  const today = partsInZone(now, zone);
  const offlineAt =
    user.offlineAfterMinutes == null
      ? null
      : zonedWallTimeToUtc(
          zone,
          today.year,
          today.month,
          today.day,
          Math.floor(user.offlineAfterMinutes / 60),
          user.offlineAfterMinutes % 60,
        );

  return {
    id: user.id,
    name: user.name,
    jobTitle: user.jobTitle,
    availabilityNote: user.availabilityNote ?? null,
    offlineAfter:
      offlineAt && user.offlineAfterMinutes != null
        ? {
            own: formatMinutes(user.offlineAfterMinutes),
            viewer: formatTimeInZone(offlineAt, viewerZone),
          }
        : null,
    email: user.email,
    timeZone: zone,
    zoneAbbr: zoneAbbreviation(now, zone),
    localTime: formatTimeInZone(now, zone),
    localDay: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long" }).format(now),
    hoursFromViewer: (offsetMinutes(now, zone) - offsetMinutes(now, viewerZone)) / 60,
    availableNow,
    nextStart: upcoming
      ? {
          own: formatTimeInZone(upcoming.start, zone),
          viewer: formatTimeInZone(upcoming.start, viewerZone),
          dayLabel: new Intl.DateTimeFormat("en-US", {
            timeZone: viewerZone,
            weekday: "long",
          }).format(upcoming.start),
        }
      : null,
    days,
    weeklyHours: Math.round((weeklyMinutes / 60) * 100) / 100,
  };
}

/** Every pair, so "who can I reach live" has an answer when all three cannot. */
export function pairOverlaps(
  members: TeamMember[],
): { a: TeamMember; b: TeamMember; windows: { start: Date; end: Date }[] }[] {
  const withHours = members.filter((m) => m.weeklyHours > 0);
  const pairs: { a: TeamMember; b: TeamMember; windows: { start: Date; end: Date }[] }[] = [];

  for (let i = 0; i < withHours.length; i++) {
    for (let j = i + 1; j < withHours.length; j++) {
      const windows = overlapWindows([withHours[i], withHours[j]]);
      if (windows.length > 0) pairs.push({ a: withHours[i], b: withHours[j], windows });
    }
  }
  // Most shared time first: the pair who can actually talk is the useful row.
  return pairs.sort(
    (x, y) => totalMinutes(y.windows) - totalMinutes(x.windows),
  );
}

function totalMinutes(windows: { start: Date; end: Date }[]): number {
  return windows.reduce((s, w) => s + (w.end.getTime() - w.start.getTime()) / 60_000, 0);
}

/** Hours a set of windows adds up to, rounded to a sensible figure. */
export function windowHours(windows: { start: Date; end: Date }[]): number {
  return Math.round((totalMinutes(windows) / 60) * 10) / 10;
}

/**
 * The hours where everybody is working at once, for the coming week.
 *
 * The number the page exists for: a team split across Pacific and Manila has
 * a narrow window where a conversation can happen live, and it moves when one
 * side changes its clocks and the other does not.
 */
export function overlapWindows(members: TeamMember[]): { start: Date; end: Date }[] {
  // Work blocks only: two people both busy elsewhere at 9pm are not "both
  // available at 9pm", and a window nobody can meet in is worse than none.
  const workBlocks = (m: TeamMember) =>
    m.days.flatMap((d) => d.blocks.filter((b) => b.kind === "Work").map((b) => ({ start: b.start, end: b.end })));
  const withHours = members.filter((m) => workBlocks(m).length > 0);
  if (withHours.length < 2) return [];

  const [first, ...rest] = withHours;
  let windows = workBlocks(first);

  for (const member of rest) {
    const theirs = workBlocks(member);
    const next: { start: Date; end: Date }[] = [];
    for (const a of windows) {
      for (const b of theirs) {
        const start = a.start > b.start ? a.start : b.start;
        const end = a.end < b.end ? a.end : b.end;
        if (start < end) next.push({ start, end });
      }
    }
    windows = next;
  }

  return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

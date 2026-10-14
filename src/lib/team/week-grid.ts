import { buildMember, describeException, type StoredBlock, type StoredException } from "./availability";
import {
  formatTimeInZone,
  partsInZone,
  zonedWallTimeToUtc,
  type TimeZoneId,
} from "@/lib/timezones";

/**
 * A week of everyone's hours, laid out on ONE clock so they can be compared.
 *
 * Two things make this more than arithmetic:
 *
 *  - A block crosses midnight when read from another zone. Manila's 9-to-6 is
 *    6pm to 3am in Pacific, which is two segments in two columns, not one bar
 *    hanging off the bottom of Monday.
 *  - A day is not always 24 hours. On a daylight-saving change the viewer's
 *    day is 23 or 25, so positions are a fraction of that day's REAL length
 *    rather than of a fixed 1440 minutes. Anything else puts every bar on the
 *    transition day out by an hour.
 */

export type GridDay = {
  /** yyyy-mm-dd in the viewer's zone. */
  date: string;
  weekday: number;
  label: string;
  start: Date;
  end: Date;
  minutes: number;
  isToday: boolean;
};

export type GridSegment = {
  dayIndex: number;
  /** Percent of the day's height, so a 23- or 25-hour day still lines up. */
  topPct: number;
  heightPct: number;
  /** The block's real start and end, in the viewer's zone. */
  startLabel: string;
  endLabel: string;
  /** The same block on the owner's own clock. */
  ownStartLabel: string;
  ownEndLabel: string;
  /** True when the bar is the tail of one that began the previous day. */
  continued: boolean;
  /** True when it runs past midnight into the next column. */
  continues: boolean;
  label: string | null;
  /** Work is SecureTECC's; Commitment is time claimed by other work. */
  kind: "Work" | "Commitment";
};

/**
 * A one-off change drawn on the grid: leave, an unavailable stretch, or time
 * blocked for something else.
 *
 * Drawn rather than merely subtracted, because "Ian is off on Thursday" and
 * "Ian never works Thursdays" look identical once the bar is simply gone --
 * and they mean completely different things to whoever is planning the week.
 */
export type GridMark = {
  dayIndex: number;
  topPct: number;
  heightPct: number;
  kind: "away" | "blocked";
  label: string;
  startLabel: string;
  endLabel: string;
  ownStartLabel: string;
  ownEndLabel: string;
  wholeDay: boolean;
};

export type GridLane = {
  memberId: string;
  name: string;
  /** The person's own zone, for showing their own clock on hover. */
  timeZone: string;
  /** A CSS custom property from the categorical palette. */
  colorVar: string;
  zoneAbbr: string;
  segments: GridSegment[];
  marks: GridMark[];
};

export type WeekGrid = {
  days: GridDay[];
  lanes: GridLane[];
  /** Where "now" falls, for the marker line. Null if outside this week. */
  now: { dayIndex: number; topPct: number } | null;
  /** Hour lines, labelled in both the viewer's zone and the other one. */
  hours: { topPct: number; viewerLabel: string; otherLabel: string }[];
  viewerZone: TimeZoneId;
  otherZone: TimeZoneId;
};

/** The five categorical hues, in the order lanes take them. */
const LANE_COLORS = ["--viz-1", "--viz-3", "--viz-2", "--viz-5", "--viz-4"];

const DAY_MS = 86_400_000;

export type GridMember = {
  id: string;
  name: string;
  jobTitle: string | null;
  email: string;
  timeZone: string;
  blocks: StoredBlock[];
  exceptions?: StoredException[];
};

export function buildWeekGrid(args: {
  members: GridMember[];
  viewerZone: TimeZoneId;
  /** The second axis, shown down the right -- usually the other office. */
  otherZone: TimeZoneId;
  now: Date;
  /** Any instant inside the week to draw. Defaults to `now`. */
  anchor?: Date;
}): WeekGrid {
  const { members, viewerZone, otherZone, now } = args;
  // The week being LOOKED at, which is only the current one by default --
  // the marker still tracks the real "now", so a past or future week simply
  // has no line on it.
  const anchor = args.anchor ?? now;

  // The viewer's week, Sunday to Saturday, as real instants. Each day is
  // measured rather than assumed: midnight to midnight is 23, 24 or 25 hours
  // depending on the date.
  const here = partsInZone(anchor, viewerZone);
  const sundayNoon = new Date(
    Date.UTC(here.year, here.month - 1, here.day, 12) - here.weekday * DAY_MS,
  );
  const weekStart = {
    year: sundayNoon.getUTCFullYear(),
    month: sundayNoon.getUTCMonth() + 1,
    day: sundayNoon.getUTCDate(),
  };

  const dayStartFor = (offset: number) => {
    const noon = new Date(
      Date.UTC(weekStart.year, weekStart.month - 1, weekStart.day + offset, 12),
    );
    return zonedWallTimeToUtc(
      viewerZone,
      noon.getUTCFullYear(),
      noon.getUTCMonth() + 1,
      noon.getUTCDate(),
      0,
      0,
    );
  };

  const today = partsInZone(now, viewerZone);
  const todayIso = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;

  const days: GridDay[] = [];
  for (let i = 0; i < 7; i++) {
    const start = dayStartFor(i);
    const end = dayStartFor(i + 1);
    const parts = partsInZone(start, viewerZone);
    const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    days.push({
      date,
      weekday: parts.weekday,
      label: new Intl.DateTimeFormat("en-US", {
        timeZone: viewerZone,
        weekday: "short",
        day: "numeric",
      }).format(start),
      start,
      end,
      minutes: (end.getTime() - start.getTime()) / 60_000,
      isToday: date === todayIso,
    });
  }

  const weekStartMs = days[0].start.getTime();
  const weekEndMs = days[6].end.getTime();

  const lanes: GridLane[] = members.map((member, index) => {
    // Resolve the member's blocks across the previous, current and next week
    // in THEIR zone, then clip to the viewer's week. Three weeks because a
    // Manila Monday can belong to a Pacific Sunday, and a Manila Saturday to
    // a Pacific Friday -- the edges of the viewer's week are fed by the
    // member's neighbouring ones.
    const resolved = [-7, 0, 7].flatMap((offsetDays) =>
      buildMember({
        user: member,
        blocks: member.blocks,
        exceptions: member.exceptions,
        viewerZone,
        now: new Date(anchor.getTime() + offsetDays * DAY_MS),
      }).days.flatMap((d) => d.blocks),
    );

    // The three passes overlap, so the same block arrives more than once.
    const seen = new Set<string>();
    const unique = resolved.filter((b) => {
      const key = `${b.start.getTime()}-${b.end.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const segments: GridSegment[] = [];
    for (const block of unique) {
      if (block.end.getTime() <= weekStartMs || block.start.getTime() >= weekEndMs) continue;

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const day = days[dayIndex];
        const from = Math.max(block.start.getTime(), day.start.getTime());
        const to = Math.min(block.end.getTime(), day.end.getTime());
        if (to <= from) continue;

        const dayMs = day.end.getTime() - day.start.getTime();
        segments.push({
          dayIndex,
          topPct: ((from - day.start.getTime()) / dayMs) * 100,
          heightPct: ((to - from) / dayMs) * 100,
          startLabel: formatTimeInZone(block.start, viewerZone),
          endLabel: formatTimeInZone(block.end, viewerZone),
          ownStartLabel: formatTimeInZone(block.start, member.timeZone as TimeZoneId),
          ownEndLabel: formatTimeInZone(block.end, member.timeZone as TimeZoneId),
          continued: from > block.start.getTime(),
          continues: to < block.end.getTime(),
          label: block.label,
          kind: block.kind,
        });
      }
    }

    // The exceptions themselves, laid on the same clock as the hours. Times
    // are wall-clock in the MEMBER's zone, so they resolve there and are then
    // clipped into the viewer's days exactly as the blocks are.
    const marks: GridMark[] = [];
    for (const exception of member.exceptions ?? []) {
      // Changed hours already show as ordinary work bars.
      if (exception.kind === "DifferentHours") continue;
      const [y, mo, d] = exception.date.split("-").map(Number);
      if (!y || !mo || !d) continue;

      const wholeDay = exception.startMinutes == null || exception.endMinutes == null;
      const from = wholeDay
        ? zonedWallTimeToUtc(member.timeZone as TimeZoneId, y, mo, d, 0, 0)
        : zonedWallTimeToUtc(
            member.timeZone as TimeZoneId,
            y,
            mo,
            d,
            Math.floor(exception.startMinutes! / 60),
            exception.startMinutes! % 60,
          );
      const endsNextDay =
        !wholeDay && exception.endMinutes! <= exception.startMinutes!;
      const to = wholeDay
        ? zonedWallTimeToUtc(member.timeZone as TimeZoneId, y, mo, d + 1, 0, 0)
        : zonedWallTimeToUtc(
            member.timeZone as TimeZoneId,
            y,
            mo,
            endsNextDay ? d + 1 : d,
            Math.floor(exception.endMinutes! / 60),
            exception.endMinutes! % 60,
          );
      if (to.getTime() <= weekStartMs || from.getTime() >= weekEndMs) continue;

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const day = days[dayIndex];
        const start = Math.max(from.getTime(), day.start.getTime());
        const end = Math.min(to.getTime(), day.end.getTime());
        if (end <= start) continue;
        const dayMs = day.end.getTime() - day.start.getTime();
        marks.push({
          dayIndex,
          topPct: ((start - day.start.getTime()) / dayMs) * 100,
          heightPct: ((end - start) / dayMs) * 100,
          kind: exception.kind === "Blocked" ? "blocked" : "away",
          label: describeException(exception),
          startLabel: formatTimeInZone(new Date(start), viewerZone),
          endLabel: formatTimeInZone(new Date(end), viewerZone),
          ownStartLabel: formatTimeInZone(new Date(start), member.timeZone as TimeZoneId),
          ownEndLabel: formatTimeInZone(new Date(end), member.timeZone as TimeZoneId),
          wholeDay,
        });
      }
    }

    return {
      memberId: member.id,
      name: member.name,
      timeZone: member.timeZone,
      colorVar: LANE_COLORS[index % LANE_COLORS.length],
      zoneAbbr: "",
      segments,
      marks,
    };
  });

  // Where the current moment sits, for the marker line.
  const todayIndex = days.findIndex((d) => now >= d.start && now < d.end);
  const nowMarker =
    todayIndex === -1
      ? null
      : {
          dayIndex: todayIndex,
          topPct:
            ((now.getTime() - days[todayIndex].start.getTime()) /
              (days[todayIndex].end.getTime() - days[todayIndex].start.getTime())) *
            100,
        };

  // Hour lines every three hours, labelled on both axes. Read off a real
  // instant on an ordinary day, so the second axis is right for the season.
  const reference = days.find((d) => d.minutes === 1440) ?? days[0];
  const hours = [];
  for (let hour = 0; hour < 24; hour += 3) {
    const instant = new Date(reference.start.getTime() + hour * 3_600_000);
    hours.push({
      topPct: (hour / 24) * 100,
      viewerLabel: formatTimeInZone(instant, viewerZone),
      otherLabel: formatTimeInZone(instant, otherZone),
    });
  }

  return { days, lanes, now: nowMarker, hours, viewerZone, otherZone };
}

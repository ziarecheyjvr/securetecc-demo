import { buildWeekGrid, type GridMember } from "./week-grid";
import { partsInZone, zonedWallTimeToUtc, type TimeZoneId } from "@/lib/timezones";

/**
 * Two months of the team's availability, a day at a time.
 *
 * The week grid answers "when exactly on Tuesday", which needs 24 hours of
 * height per day and cannot show eight weeks at once. This answers the other
 * question -- "which days is anyone around, and when is nobody" -- at one
 * row per week, which fits.
 *
 * Built by running the week grid across the range and totalling each day,
 * rather than resolving hours a second way: two implementations of "what
 * does this person's Tuesday look like" would eventually disagree, and the
 * one with daylight saving in it is the one that must not be duplicated.
 */
export type MonthDayMember = {
  memberId: string;
  name: string;
  colorVar: string;
  /** Hours available to SecureTECC on this day, in the viewer's zone. */
  hours: number;
  away: boolean;
  blocked: boolean;
  /** "On leave — Family event", when something one-off applies. */
  note: string | null;
};

export type MonthDay = {
  date: string;
  dayOfMonth: number;
  /** False for the leading and trailing days that pad the first and last weeks. */
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  members: MonthDayMember[];
  totalHours: number;
};

export type MonthOverview = {
  label: string;
  weeks: MonthDay[][];
};

const DAY_MS = 86_400_000;

/** The first day of the month `at` falls in, as a y/m/d in `zone`. */
function monthStartIn(at: Date, zone: TimeZoneId) {
  const p = partsInZone(at, zone);
  return { year: p.year, month: p.month, day: 1 };
}

export function buildMonthOverview(args: {
  members: GridMember[];
  viewerZone: TimeZoneId;
  otherZone: TimeZoneId;
  now: Date;
  /** Any instant inside the first month to show. */
  anchor?: Date;
  /** How many months, including the first. */
  months?: number;
}): MonthOverview[] {
  const { members, viewerZone, otherZone, now } = args;
  const anchor = args.anchor ?? now;
  const months = args.months ?? 2;

  const first = monthStartIn(anchor, viewerZone);
  // One day per calendar date in the range, with its totals filled in below.
  const byDate = new Map<string, MonthDay>();
  const out: MonthOverview[] = [];

  for (let m = 0; m < months; m++) {
    const monthDate = new Date(Date.UTC(first.year, first.month - 1 + m, 1, 12));
    const year = monthDate.getUTCFullYear();
    const month = monthDate.getUTCMonth() + 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();

    const cells: MonthDay[] = [];
    // Pad back to the Sunday the month starts in, so every row is a week.
    for (let pad = firstWeekday; pad > 0; pad--) {
      const d = new Date(Date.UTC(year, month - 1, 1 - pad, 12));
      cells.push(blankDay(d, false, now, viewerZone));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(blankDay(new Date(Date.UTC(year, month - 1, day, 12)), true, now, viewerZone));
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1];
      const [y, mo, d] = last.date.split("-").map(Number);
      cells.push(blankDay(new Date(Date.UTC(y, mo - 1, d + 1, 12)), false, now, viewerZone));
    }

    for (const cell of cells) byDate.set(cell.date, cell);
    const weeks: MonthDay[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    out.push({
      label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate),
      weeks,
    });
  }

  // Walk the range a week at a time and total each day from the real grid.
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return out;
  const firstInstant = noonUtcToZone(dates[0], viewerZone);
  const lastInstant = noonUtcToZone(dates[dates.length - 1], viewerZone);

  for (let at = firstInstant; at.getTime() <= lastInstant.getTime(); at = new Date(at.getTime() + 7 * DAY_MS)) {
    const grid = buildWeekGrid({ members, viewerZone, otherZone, now, anchor: at });
    for (const lane of grid.lanes) {
      const member = members.find((m) => m.id === lane.memberId);
      if (!member) continue;

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const day = grid.days[dayIndex];
        const cell = byDate.get(day.date);
        if (!cell) continue;

        const minutes = lane.segments
          .filter((s) => s.dayIndex === dayIndex && s.kind === "Work")
          .reduce((sum, s) => sum + (s.heightPct / 100) * day.minutes, 0);
        const marks = lane.marks.filter((m) => m.dayIndex === dayIndex);
        const away = marks.some((m) => m.kind === "away");
        const blocked = marks.some((m) => m.kind === "blocked");
        if (minutes === 0 && !away && !blocked) continue;

        // A week can be visited twice at a month boundary; keep one row per
        // person per day rather than doubling their hours.
        if (cell.members.some((m) => m.memberId === lane.memberId)) continue;
        const hours = Math.round((minutes / 60) * 10) / 10;
        cell.members.push({
          memberId: lane.memberId,
          name: lane.name,
          colorVar: lane.colorVar,
          hours,
          away,
          blocked,
          note: marks[0]?.label ?? null,
        });
        cell.totalHours = Math.round((cell.totalHours + hours) * 10) / 10;
      }
    }
  }

  for (const month of out) {
    for (const week of month.weeks) {
      for (const day of week) day.members.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return out;
}

function blankDay(utcNoon: Date, inMonth: boolean, now: Date, zone: TimeZoneId): MonthDay {
  const date = utcNoon.toISOString().slice(0, 10);
  const todayParts = partsInZone(now, zone);
  const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
  const weekday = utcNoon.getUTCDay();
  return {
    date,
    dayOfMonth: utcNoon.getUTCDate(),
    inMonth,
    isToday: date === today,
    isWeekend: weekday === 0 || weekday === 6,
    members: [],
    totalHours: 0,
  };
}

/** "2026-10-07" -> an instant safely inside that day in `zone`. */
function noonUtcToZone(date: string, zone: TimeZoneId): Date {
  const [y, m, d] = date.split("-").map(Number);
  return zonedWallTimeToUtc(zone, y, m, d, 12, 0);
}

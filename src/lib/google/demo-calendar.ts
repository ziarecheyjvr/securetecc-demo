import { prisma } from "@/lib/db/prisma";
import { PACIFIC_TZ } from "@/lib/cron/pacific";
import type { CalendarEvent } from "./calendar";

/**
 * A week of plausible appointments for the demo.
 *
 * The demo has no Workspace account behind it, so the real calendar reports
 * "not connected" and the tab shows nothing of what it is for. These events
 * are invented, but they are built around the clients the demo seed actually
 * created, so a visit on Tuesday names a company that exists everywhere else
 * in the demo rather than a placeholder.
 *
 * Times are Pacific wall-clock, resolved against each real date, so the week
 * reads the same whichever side of a daylight-saving change it falls on.
 */

const DAY_MS = 86_400_000;

type Slot = {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  startHour: number;
  startMinute?: number;
  durationMinutes: number;
  /** "{client}" is replaced with a seeded client's name. */
  summary: string;
  location?: string;
  calendar?: string;
};

const WEEK: Slot[] = [
  { weekday: 1, startHour: 8, startMinute: 30, durationMinutes: 30, summary: "Team stand-up", calendar: "SecureTECC Operations" },
  { weekday: 1, startHour: 10, durationMinutes: 90, summary: "On-site visit — {client}", location: "Client site" },
  { weekday: 1, startHour: 14, durationMinutes: 60, summary: "Quarterly review — {client}", location: "Video call" },
  { weekday: 2, startHour: 8, startMinute: 30, durationMinutes: 30, summary: "Team stand-up", calendar: "SecureTECC Operations" },
  { weekday: 2, startHour: 9, startMinute: 30, durationMinutes: 120, summary: "Workstation rollout — {client}", location: "Client site" },
  { weekday: 2, startHour: 15, durationMinutes: 45, summary: "Security review — {client}", location: "Video call" },
  { weekday: 3, startHour: 8, startMinute: 30, durationMinutes: 30, summary: "Team stand-up", calendar: "SecureTECC Operations" },
  { weekday: 3, startHour: 11, durationMinutes: 60, summary: "Firewall maintenance window — {client}", location: "Remote" },
  { weekday: 3, startHour: 13, startMinute: 30, durationMinutes: 60, summary: "Backup restore test — {client}", location: "Remote" },
  { weekday: 4, startHour: 8, startMinute: 30, durationMinutes: 30, summary: "Team stand-up", calendar: "SecureTECC Operations" },
  { weekday: 4, startHour: 10, durationMinutes: 90, summary: "New office network walkthrough — {client}", location: "Client site" },
  { weekday: 4, startHour: 16, durationMinutes: 30, summary: "Invoicing and billing review", calendar: "SecureTECC Operations" },
  { weekday: 5, startHour: 8, startMinute: 30, durationMinutes: 30, summary: "Team stand-up", calendar: "SecureTECC Operations" },
  { weekday: 5, startHour: 9, durationMinutes: 60, summary: "Email migration check-in — {client}", location: "Video call" },
  { weekday: 5, startHour: 14, durationMinutes: 120, summary: "Patch window — all managed clients", location: "Remote", calendar: "SecureTECC Operations" },
];

/** Pacific wall-clock time on a given UTC date, as a real instant. */
function pacificAt(day: Date, hour: number, minute: number): Date {
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth() + 1;
  const d = day.getUTCDate();
  // Pacific is UTC-7 or UTC-8; try both and keep whichever reads back right.
  for (const offset of [7, 8]) {
    const guess = new Date(Date.UTC(y, m - 1, d, hour + offset, minute));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC_TZ,
      hour: "2-digit",
      hour12: false,
      day: "2-digit",
    }).formatToParts(guess);
    const readHour = Number(parts.find((p) => p.type === "hour")?.value ?? "-1") % 24;
    const readDay = Number(parts.find((p) => p.type === "day")?.value ?? "-1");
    if (readHour === hour && readDay === d) return guess;
  }
  return new Date(Date.UTC(y, m - 1, d, hour + 8, minute));
}

export async function buildDemoEvents(args: { timeMin: Date; timeMax: Date }): Promise<CalendarEvent[]> {
  let clients: string[] = [];
  try {
    const rows = await prisma.client.findMany({
      where: { activeStatus: true },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 12,
    });
    clients = rows.map((r) => r.name);
  } catch {
    // A calendar that cannot reach the database still shows the internal
    // meetings rather than failing the page it sits on.
    clients = [];
  }

  const events: CalendarEvent[] = [];
  const firstDay = new Date(Date.UTC(args.timeMin.getUTCFullYear(), args.timeMin.getUTCMonth(), args.timeMin.getUTCDate(), 12));
  const lastMs = args.timeMax.getTime();

  let pick = 0;
  for (let day = firstDay; day.getTime() - DAY_MS < lastMs; day = new Date(day.getTime() + DAY_MS)) {
    for (const slot of WEEK.filter((s) => s.weekday === day.getUTCDay())) {
      const start = pacificAt(day, slot.startHour, slot.startMinute ?? 0);
      const end = new Date(start.getTime() + slot.durationMinutes * 60_000);
      if (end <= args.timeMin || start >= args.timeMax) continue;

      const needsClient = slot.summary.includes("{client}");
      if (needsClient && clients.length === 0) continue;
      const summary = needsClient ? slot.summary.replace("{client}", clients[pick++ % clients.length]) : slot.summary;

      events.push({
        id: `demo-${start.toISOString()}-${slot.weekday}-${slot.startHour}`,
        summary,
        location: slot.location ?? null,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        htmlLink: null,
        calendar: slot.calendar ?? "Tony Gregory",
      });
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}

import { getGoogleAccessToken, GoogleNotConfiguredError } from "./auth";

/**
 * Read-only calendar, through the same domain-wide delegation the Gmail and
 * Drive integrations already use.
 *
 * Read-only on purpose: this shows Tony what his day looks like beside his
 * tasks and tickets. Nothing here creates, moves or deletes an event -- a
 * platform that can quietly rearrange someone's calendar is a different and
 * much riskier thing than one that displays it.
 *
 * The scope must be granted to the service account in Workspace admin
 * alongside the Gmail and Drive ones. Until it is, Google returns 403 and
 * that is surfaced as "not connected" rather than as an error, because an
 * ungranted scope is a setup step, not a fault.
 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const API = "https://www.googleapis.com/calendar/v3";

export type CalendarEvent = {
  id: string;
  summary: string;
  location: string | null;
  /** ISO instant, or a yyyy-mm-dd for an all-day event. */
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
  calendar: string;
};

export type CalendarResult =
  | { ok: true; events: CalendarEvent[] }
  | {
      ok: false;
      reason: "not-configured" | "api-disabled" | "not-authorized" | "error";
      message: string;
    };

/**
 * Why Google refused, in its own words.
 *
 * A 403 has two completely different causes here and they are fixed in two
 * different consoles: the SCOPE can be missing from domain-wide delegation
 * (Workspace admin), or the API can simply not be enabled on the Cloud
 * project (Cloud console). Telling someone to grant a scope they have
 * already granted sends them back to the wrong screen, which is exactly what
 * this used to do.
 */
async function refusalReason(response: Response): Promise<{
  reason: "api-disabled" | "not-authorized";
  message: string;
}> {
  let body: {
    error?: { message?: string; errors?: { reason?: string }[]; status?: string };
  } = {};
  try {
    body = await response.json();
  } catch {
    // Fall through to the scope message; a body we cannot read tells us
    // nothing either way.
  }

  const codes = (body.error?.errors ?? []).map((e) => e.reason);
  if (codes.includes("accessNotConfigured") || /has not been used in project/i.test(body.error?.message ?? "")) {
    return {
      reason: "api-disabled",
      message:
        "The Google Calendar API is not enabled on the Cloud project. Enable it in the Google " +
        "Cloud console under APIs & Services → Library → Google Calendar API. The domain-wide " +
        "delegation grant is separate and is already in place.",
    };
  }

  return {
    reason: "not-authorized",
    message:
      "Google refused the calendar request. The calendar.readonly scope needs granting to the " +
      "service account in Workspace admin → Security → API controls → Domain-wide delegation.",
  };
}

type GoogleEvent = {
  id?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

/**
 * Events between two instants, across every calendar the impersonated user
 * can see -- Tony asked for all of his accounts in one place, and a person's
 * calendar list is exactly that: their own plus everything shared with them.
 */
/**
 * The demo has no Workspace account behind it, so the week is built from the
 * clients the demo seed created -- see lib/google/demo-calendar. The real
 * implementation is kept below, unchanged, as listLiveUpcomingEvents.
 */
export async function listUpcomingEvents(args: {
  timeMin: Date;
  timeMax: Date;
  maxPerCalendar?: number;
}): Promise<CalendarResult> {
  const { buildDemoEvents } = await import("./demo-calendar");
  return { ok: true, events: await buildDemoEvents(args) };
}

export async function listLiveUpcomingEvents(args: {
  timeMin: Date;
  timeMax: Date;
  maxPerCalendar?: number;
}): Promise<CalendarResult> {
  let token: string;
  try {
    token = await getGoogleAccessToken(CALENDAR_SCOPE);
  } catch (err) {
    if (err instanceof GoogleNotConfiguredError) {
      return { ok: false, reason: "not-configured", message: "Google Workspace isn't connected." };
    }
    return {
      ok: false,
      reason: "not-authorized",
      message:
        "The calendar scope hasn't been granted to the service account yet. Add " +
        `${CALENDAR_SCOPE} in Workspace admin → domain-wide delegation.`,
    };
  }

  const headers = { Authorization: `Bearer ${token}` };

  const listResponse = await fetch(`${API}/users/me/calendarList?minAccessRole=reader`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (listResponse.status === 403 || listResponse.status === 401) {
    return { ok: false, ...(await refusalReason(listResponse)) };
  }
  if (!listResponse.ok) {
    return { ok: false, reason: "error", message: `Calendar list failed (${listResponse.status}).` };
  }

  const calendars = ((await listResponse.json()) as {
    items?: { id: string; summary?: string; selected?: boolean }[];
  }).items ?? [];

  const events: CalendarEvent[] = [];
  for (const calendar of calendars) {
    const params = new URLSearchParams({
      timeMin: args.timeMin.toISOString(),
      timeMax: args.timeMax.toISOString(),
      singleEvents: "true", // expand recurrences, or a weekly standup shows once
      orderBy: "startTime",
      maxResults: String(args.maxPerCalendar ?? 20),
    });
    const response = await fetch(
      `${API}/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    // One unreadable calendar must not empty the whole day's view.
    if (!response.ok) continue;

    const items = ((await response.json()) as { items?: GoogleEvent[] }).items ?? [];
    for (const item of items) {
      if (item.status === "cancelled") continue;
      const start = item.start?.dateTime ?? item.start?.date;
      const end = item.end?.dateTime ?? item.end?.date;
      if (!start || !end) continue;
      events.push({
        id: item.id ?? `${calendar.id}:${start}`,
        summary: item.summary?.trim() || "(no title)",
        location: item.location?.trim() || null,
        start,
        end,
        allDay: !item.start?.dateTime,
        htmlLink: item.htmlLink ?? null,
        calendar: calendar.summary ?? calendar.id,
      });
    }
  }

  // All-day events first, then by start time: that is the order a day reads.
  events.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.localeCompare(b.start);
  });

  return { ok: true, events };
}

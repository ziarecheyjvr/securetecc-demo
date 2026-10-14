import { CalendarDays } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { pacificDayStart, PACIFIC_TZ } from "@/lib/cron/pacific";
import { CALENDAR_SCOPE, listUpcomingEvents } from "@/lib/google/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Read-only view of the Workspace calendars, for the week ahead.
 *
 * Read-only deliberately. Tony asked to SEE his calendar beside the rest of
 * the platform; a tool that can also move or delete his meetings is a much
 * larger promise, and one nobody asked for.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireOrgContext();
  const { days } = await searchParams;
  const span = Math.min(30, Math.max(1, Number(days) || 7));

  const start = pacificDayStart();
  const end = new Date(start.getTime() + span * 24 * 3_600_000);
  const result = await listUpcomingEvents({ timeMin: start, timeMax: end, maxPerCalendar: 50 });

  const dayFormat = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: PACIFIC_TZ,
  });
  const timeFormat = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: PACIFIC_TZ,
  });
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ });

  // Grouped by Pacific day. An all-day event carries a plain yyyy-mm-dd and
  // must NOT go through a Date -- that reads as UTC midnight and lands it on
  // the previous day in Pacific.
  const byDay = new Map<string, typeof events>();
  const events = result.ok ? result.events : [];
  for (const event of events) {
    const key = event.allDay ? event.start.slice(0, 10) : dayKey.format(new Date(event.start));
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground">
          The next {span} days across every calendar your Workspace account can see. Read-only —
          nothing here changes an event.
        </p>
      </div>

      {!result.ok ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {result.reason === "not-configured"
                ? "Not connected"
                : result.reason === "api-disabled"
                  ? "One step left in Google Cloud"
                  : "Not authorized yet"}
            </CardTitle>
            <CardDescription>{result.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {result.reason === "api-disabled" ? (
              <p>
                Everything on the Workspace side is done. The Calendar API just has not been
                switched on for the Cloud project yet — one toggle, and this page fills itself.
              </p>
            ) : (
              <>
                <p>
                  The calendar uses the same service account as Gmail drafts and Drive archiving.
                  It needs one more scope granted in Workspace admin → Security → API controls →
                  Domain-wide delegation, on the existing client ID:
                </p>
                <code className="block rounded border bg-muted/40 p-2 text-xs">
                  {CALENDAR_SCOPE}
                </code>
              </>
            )}
          </CardContent>
        </Card>
      ) : byDay.size === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing scheduled in the next {span} days.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([key, dayEvents]) => {
            const [y, m, d] = key.split("-").map(Number);
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {dayFormat.format(new Date(Date.UTC(y, m - 1, d, 12)))}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {dayEvents.map((e) => (
                      <li key={e.id} className="flex items-baseline gap-3 py-2">
                        <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                          {e.allDay
                            ? "All day"
                            : `${timeFormat.format(new Date(e.start))} – ${timeFormat.format(new Date(e.end))}`}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{e.summary}</span>
                          {(e.location || e.calendar) && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {[e.location, e.calendar].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { CalendarDays, Clock, ListChecks, Ticket } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { buildGreeting, PACIFIC_LONG_DATE } from "@/lib/greeting";
import { pacificDayStart, PACIFIC_TZ } from "@/lib/cron/pacific";
import { listUpcomingEvents } from "@/lib/google/calendar";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/validations/task";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatHours } from "@/lib/format";

/**
 * The "start here" screen: what today asks of you, in one place.
 *
 * Everything on it already exists somewhere else in the platform -- the point
 * is not new data, it is not having to visit four pages to find out whether
 * the day is under control.
 */
export default async function TodayPage() {
  const { appUser, authUserId } = await requireOrgContext();
  const dayStart = pacificDayStart();
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

  const [tasks, todayTime, openTickets] = await withRLS(authUserId, (tx) =>
    Promise.all([
      tx.task.findMany({
        // Assigned to me in either sense: the task filed under me, or one I
        // share with someone else.
        where: {
          status: { not: "Completed" },
          OR: [
            { assignedToUserId: appUser.id },
            { assignees: { some: { userId: appUser.id } } },
          ],
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
        take: 8,
      }),
      tx.timeEntry.aggregate({
        where: { loggedByUserId: appUser.id, date: { gte: dayStart, lt: dayEnd } },
        _count: true,
        _sum: { durationHours: true },
      }),
      tx.ticket.findMany({
        where: { status: { in: ["New", "InProgress"] } },
        orderBy: [{ urgency: "asc" }, { createdAt: "asc" }],
        take: 6,
        select: {
          id: true,
          ticketNumber: true,
          clientCompanyName: true,
          urgency: true,
          status: true,
        },
      }),
    ]),
  );

  // Fetched outside the transaction: it is a network call to Google, and a
  // slow or unauthorized calendar must not hold a database connection open.
  const calendar = await listUpcomingEvents({ timeMin: dayStart, timeMax: dayEnd });

  const greeting = buildGreeting({
    firstName: appUser.name.split(" ")[0],
    birthMonth: appUser.birthMonth,
    birthDay: appUser.birthDay,
    organizationName: appUser.organization.name,
  });

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: PACIFIC_TZ,
  });

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(dayStart);
  const dueToday = tasks.filter((t) => t.dueDate?.toISOString().slice(0, 10) === todayIso).length;
  const overdue = tasks.filter(
    (t) => t.dueDate && t.dueDate.toISOString().slice(0, 10) < todayIso,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-glow text-2xl font-semibold tracking-tight text-[var(--teal-ink)]">
          {greeting.headline}
        </h1>
        <p className="text-muted-foreground">{PACIFIC_LONG_DATE.format(new Date())}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> Today&apos;s calendar
            </CardTitle>
            <CardDescription>
              Everything on the calendars your Workspace account can see.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!calendar.ok ? (
              <p className="text-sm text-muted-foreground">
                {calendar.reason === "not-configured"
                  ? "Google Workspace isn't connected yet, so there's nothing to show here."
                  : calendar.message}
              </p>
            ) : calendar.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled today.</p>
            ) : (
              <ul className="divide-y">
                {calendar.events.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-3 py-2">
                    <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {e.allDay ? "All day" : time.format(new Date(e.start))}
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-muted-foreground" /> Your tasks
            </CardTitle>
            <CardDescription>
              {tasks.length === 0
                ? "Nothing assigned to you."
                : `${tasks.length} open${overdue > 0 ? ` · ${overdue} overdue` : ""}${
                    dueToday > 0 ? ` · ${dueToday} due today` : ""
                  }`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing on your plate right now.
              </p>
            ) : (
              <ul className="divide-y">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {TASK_STATUS_LABELS[t.status]}
                    </span>
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {TASK_PRIORITY_LABELS[t.priority]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/tasks"
              className={`mt-3 ${buttonVariants({ variant: "outline", size: "sm" })}`}
            >
              Open the board
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-muted-foreground" /> Time logged today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatHours(Number(todayTime._sum.durationHours ?? 0))}h
            </p>
            <p className="text-sm text-muted-foreground">
              {todayTime._count === 0
                ? "Nothing logged yet today."
                : `${todayTime._count} ${todayTime._count === 1 ? "entry" : "entries"}.`}
            </p>
            <Link
              href="/time-entries"
              className={`mt-3 ${buttonVariants({ variant: "outline", size: "sm" })}`}
            >
              Log time
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ticket className="h-4 w-4 text-muted-foreground" /> Tickets needing attention
            </CardTitle>
            <CardDescription>New and in progress — not waiting on a client.</CardDescription>
          </CardHeader>
          <CardContent>
            {openTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing open.</p>
            ) : (
              <ul className="divide-y">
                {openTickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-2">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="shrink-0 text-sm font-medium hover:underline"
                    >
                      {t.ticketNumber}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {t.clientCompanyName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t.urgency}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

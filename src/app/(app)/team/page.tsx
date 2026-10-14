import { Pencil } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import {
  buildMember,
  describeException,
  overlapWindows,
  pairOverlaps,
  windowHours,
  type TeamMember,
} from "@/lib/team/availability";
import {
  MANILA,
  PACIFIC,
  WEEKDAY_SHORT,
  formatTimeInZone,
  toTimeInputValue,
  hoursBetween,
  zoneAbbreviation,
} from "@/lib/timezones";
import { AvailabilityEditor } from "@/components/app/availability-editor";
import { AvailabilityExceptions } from "@/components/app/availability-exceptions";
import { Suspense } from "react";
import { TeamWeekGrid } from "@/components/app/team-week-grid";
import { TeamMonthOverview } from "@/components/app/team-month-overview";
import { TeamCalendarControls } from "@/components/app/team-calendar-controls";
import { buildMonthOverview } from "@/lib/team/month-overview";
import { buildWeekGrid } from "@/lib/team/week-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Who is working, when, in everybody's own time.
 *
 * The page exists because Pacific observes daylight saving and Manila does
 * not, so the gap between the two is 15 hours for part of the year and 16 for
 * the rest. Every conversion here is done against a real date with the
 * runtime's tz database, never against a stored offset -- an offset written
 * down in September is wrong from November.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; at?: string; who?: string }>;
}) {
  const { appUser, authUserId } = await requireOrgContext();
  const sp = await searchParams;
  const view = sp.view === "months" ? "months" : "week";
  const who = sp.who ?? "all";
  const now = new Date();
  // The period being looked at. Unparseable or absent means the one we are in,
  // so a hand-edited URL shows this week rather than erroring.
  const at = /^\d{4}-\d{2}-\d{2}$/.test(sp.at ?? "")
    ? new Date(`${sp.at}T12:00:00Z`)
    : now;
  // A day of slack either side of "today" covers every zone on the team.
  const since = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);

  const staff = await withRLS(authUserId, (tx) =>
    tx.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        jobTitle: true,
        timeZone: true,
        offlineAfterMinutes: true,
        availabilityNote: true,
        estimatedWeeklyHours: true,
        availability: {
          select: { weekday: true, startMinutes: true, endMinutes: true, label: true, kind: true },
        },
        availabilityExceptions: {
          where: { date: { gte: since } },
          orderBy: [{ date: "asc" }, { startMinutes: "asc" }],
          select: {
            id: true,
            date: true,
            kind: true,
            startMinutes: true,
            endMinutes: true,
            note: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  );

  // Everything is rendered against the VIEWER's own zone as well as the
  // owner's, so "when can I reach them" is answered without arithmetic.
  const viewerZone = staff.find((s) => s.id === appUser.id)?.timeZone ?? PACIFIC;

  const members: TeamMember[] = staff
    .map((user) =>
      buildMember({
        user: {
          id: user.id,
          name: user.name,
          jobTitle: user.jobTitle,
          email: user.email,
          timeZone: user.timeZone,
          offlineAfterMinutes: user.offlineAfterMinutes,
          availabilityNote: user.availabilityNote,
        },
        blocks: user.availability,
        exceptions: user.availabilityExceptions,
        viewerZone,
        now,
      }),
    )
    // People with hours first. An account with none still belongs on the page
    // -- that is how it gets prompted to set them -- but it is not what
    // anyone came here to read.
    .sort(
      (a, b) =>
        Number(b.weeklyHours > 0) - Number(a.weeklyHours > 0) || a.name.localeCompare(b.name),
    );

  const withHours = members.filter((m) => m.weeklyHours > 0);

  // The same hours as the cards below, drawn on one clock so they can be
  // compared. The second axis is whichever of the two offices the viewer is
  // NOT in -- a Pacific viewer wants Manila beside their own scale.
  const shown = who === "all" ? staff : staff.filter((u) => u.id === who);
  const gridMembers = shown.map((u) => ({
    id: u.id,
    name: u.name,
    jobTitle: u.jobTitle,
    email: u.email,
    timeZone: u.timeZone,
    blocks: u.availability,
    exceptions: u.availabilityExceptions,
  }));
  const otherZone = viewerZone === MANILA ? PACIFIC : MANILA;

  const grid = buildWeekGrid({ members: gridMembers, viewerZone, otherZone, now, anchor: at });
  const monthsView =
    view === "months"
      ? buildMonthOverview({ members: gridMembers, viewerZone, otherZone, now, anchor: at, months: 2 })
      : [];

  // What the arrows move by, and what the label says, depend on the view.
  const dayMs = 86_400_000;
  const shiftWeek = (by: number) => new Date(at.getTime() + by * 7 * dayMs).toISOString().slice(0, 10);
  const shiftMonth = (by: number) => {
    const p = new Date(at);
    return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + by, 1, 12)).toISOString().slice(0, 10);
  };
  const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: viewerZone });
  const rangeLabel =
    view === "months"
      ? `${monthsView[0]?.label ?? ""} – ${monthsView[1]?.label ?? ""}`
      : `${dayLabel.format(grid.days[0].start)} – ${dayLabel.format(grid.days[6].start)}`;
  const shared = overlapWindows(withHours);
  // When all three never coincide, who CAN reach whom is the useful answer.
  const pairs = pairOverlaps(members);
  const gapNow = hoursBetween(now, PACIFIC, MANILA);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground">
          Who is usually working, and when — in their time and in yours. These are general
          hours, not a live schedule: leave, blocked time and changed days are listed under each
          person, and anything urgent is still worth a message first.
        </p>
      </div>

      {/* The two clocks, side by side. The gap between them is the fact the
          rest of the page turns on, and it is not a constant. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-4 py-5">
          <Clock label="Pacific" zone={PACIFIC} now={now} />
          <Clock label="Manila" zone={MANILA} now={now} />
          <p className="max-w-sm text-sm text-muted-foreground">
            Manila is <strong>{gapNow} hours ahead</strong> of Pacific right now. It is{" "}
            {gapNow === 15 ? "15" : "16"} because Pacific is on{" "}
            {zoneAbbreviation(now, PACIFIC)} — the gap becomes {gapNow === 15 ? "16" : "15"} when
            that changes. Manila does not observe daylight saving at all.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {view === "months" ? "Two months" : "The week"}
              </CardTitle>
              <CardDescription>
                {view === "months"
                  ? "Which days have cover, and which have none. Switch to Week for the hour-by-hour view."
                  : `Everyone's hours on one clock — yours down the left, ${viewerZone === MANILA ? "Pacific" : "Manila"} down the right. The full day is drawn because a ${viewerZone === MANILA ? "Pacific" : "Manila"} shift lands in your evening, and cropping to office hours would hide it.`}
              </CardDescription>
            </div>
          </div>
          <div className="pt-3">
            <Suspense fallback={null}>
              <TeamCalendarControls
                view={view}
                rangeLabel={rangeLabel}
                previous={view === "months" ? shiftMonth(-1) : shiftWeek(-1)}
                next={view === "months" ? shiftMonth(1) : shiftWeek(1)}
                people={staff.map((u) => ({ id: u.id, name: u.name }))}
                who={who}
              />
            </Suspense>
          </div>
        </CardHeader>
        <CardContent>
          {view === "months" ? (
            <TeamMonthOverview
              months={monthsView}
              viewerAbbr={zoneAbbreviation(now, viewerZone)}
              otherAbbr={zoneAbbreviation(now, otherZone)}
            />
          ) : (
            <TeamWeekGrid grid={grid} now={now} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">When everyone is working at once</CardTitle>
          <CardDescription>
            The window for a live conversation, this week. It moves when the clocks change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {withHours.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Set hours for at least two people and the shared window appears here.
            </p>
          ) : shared.length === 0 ? (
            <div
              className="rounded-lg border p-3 text-sm"
              style={{
                borderColor: "var(--viz-warn)",
                background: "color-mix(in oklab, var(--viz-warn) 8%, transparent)",
              }}
            >
              <p className="font-medium">No hours where everyone is working at once.</p>
              <p className="mt-1 text-muted-foreground">
                With {withHours.length} people across {new Set(withHours.map((m) => m.timeZone)).size}{" "}
                zones, the working days do not meet. Anything needing all of you live has to be
                arranged outside someone&apos;s normal hours.
              </p>
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {shared.slice(0, 8).map((w, i) => (
                <li key={i} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: viewerZone,
                      weekday: "long",
                    }).format(w.start)}
                  </p>
                  <p className="tabular-nums">
                    {formatTimeInZone(w.start, viewerZone)} – {formatTimeInZone(w.end, viewerZone)}{" "}
                    <span className="text-muted-foreground">
                      {zoneAbbreviation(w.start, viewerZone)}
                    </span>
                  </p>
                  {viewerZone !== MANILA && (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatTimeInZone(w.start, MANILA)} – {formatTimeInZone(w.end, MANILA)} Manila
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {pairs.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Who overlaps with whom, this week
              </p>
              <ul className="space-y-1.5">
                {pairs.map(({ a, b, windows }) => (
                  <li key={`${a.id}-${b.id}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">
                      {a.name.split(" ")[0]} &amp; {b.name.split(" ")[0]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {windowHours(windows)}h across {windows.length} day
                      {windows.length === 1 ? "" : "s"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      · {formatTimeInZone(windows[0].start, viewerZone)} –{" "}
                      {formatTimeInZone(windows[0].end, viewerZone)} your time
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {members.map((member) => (
          <Card key={member.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {member.name}
                    {(() => {
                      const todayOwn = new Intl.DateTimeFormat("en-CA", {
                        timeZone: member.timeZone,
                      }).format(now);
                      const changedToday = member.days.find((d) => d.date === todayOwn)?.exceptions ?? [];
                      if (changedToday.some((e) => e.startsWith("On leave"))) {
                        return <Badge variant="secondary">On leave today</Badge>;
                      }
                      return member.availableNow ? (
                        <Badge
                          style={{
                            background: "color-mix(in oklab, var(--viz-good) 18%, transparent)",
                            color: "var(--viz-good)",
                          }}
                        >
                          Usually working now
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Usually off now</Badge>
                      );
                    })()}
                  </CardTitle>
                  <CardDescription>
                    {member.jobTitle ? `${member.jobTitle} · ` : ""}
                    {member.localDay} {member.localTime} {member.zoneAbbr}
                    {member.hoursFromViewer !== 0 && (
                      <>
                        {" · "}
                        {Math.abs(member.hoursFromViewer)}h{" "}
                        {member.hoursFromViewer > 0 ? "ahead of" : "behind"} you
                      </>
                    )}
                  </CardDescription>
                </div>

                {(appUser.role === "admin" || appUser.id === member.id) && (
                  <AvailabilityEditor
                    userId={member.id}
                    name={member.name}
                    timeZone={member.timeZone}
                    jobTitle={member.jobTitle}
                    offlineAfter={(() => {
                      const mins = staff.find((s) => s.id === member.id)?.offlineAfterMinutes;
                      return mins == null ? null : toTimeInputValue(mins);
                    })()}
                    availabilityNote={member.availabilityNote}
                    estimatedWeeklyHours={
                      staff.find((s) => s.id === member.id)?.estimatedWeeklyHours ?? null
                    }
                    blocks={
                      staff.find((s) => s.id === member.id)?.availability.map((b) => ({
                        weekday: b.weekday,
                        startMinutes: b.startMinutes,
                        endMinutes: b.endMinutes,
                        label: b.label,
                        kind: b.kind,
                      })) ?? []
                    }
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Usual hours
                      </Button>
                    }
                  />
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {member.days.every((d) => d.blocks.length === 0) ? (
                <p className="text-sm text-muted-foreground">
                  No hours set yet.
                  {appUser.role === "admin" || appUser.id === member.id
                    ? " Use Hours above to add them."
                    : ""}
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {member.days
                      .filter((d) => d.blocks.length > 0)
                      .map((day) => (
                        <li key={day.weekday} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                          <span className="w-10 shrink-0 font-medium">
                            {WEEKDAY_SHORT[day.weekday]}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            {day.blocks.map((block, i) => (
                              <span key={i} className={block.kind === "Commitment" ? "text-muted-foreground" : ""}>
                                <span className="tabular-nums">{block.ownHours}</span>
                                {block.kind === "Commitment" && (
                                  <span className="ml-2 text-xs">{block.label ?? "Other"}</span>
                                )}
                                {block.kind === "Work" && block.label && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {block.label}
                                  </span>
                                )}
                                {/* The same block on the viewer's clock. Only
                                    shown when the two differ, so a colleague
                                    in the same zone is not told their own
                                    hours twice. */}
                                {member.timeZone !== viewerZone && (
                                  <span className="block text-xs tabular-nums text-muted-foreground">
                                    {block.viewerHours} your time
                                    {block.viewerDayNote ? ` — ${block.viewerDayNote}` : ""}
                                  </span>
                                )}
                              </span>
                            ))}
                          </span>
                        </li>
                      ))}
                  </ul>

                  <p className="border-t pt-2 text-xs text-muted-foreground">
                    {(() => {
                      const estimate = staff.find((s) => s.id === member.id)?.estimatedWeeklyHours;
                      // The booked blocks and what the week really looks like
                      // are two different facts; showing only the first makes
                      // someone who fits work around other clients look idle.
                      // With an estimate set, the booked figure is dropped
                      // rather than shown beside it: for someone whose
                      // SecureTECC work happens inside blocks labelled for
                      // other work, the booked number measures the calendar,
                      // not the week, and reads as near-zero capacity.
                      return estimate != null
                        ? `About ${estimate}h a week for SecureTECC`
                        : `${member.weeklyHours}h a week for SecureTECC`;
                    })()}
                    {!member.availableNow && member.nextStart && (
                      <>
                        {" · next on "}
                        {member.nextStart.dayLabel} at{" "}
                        <span className="tabular-nums">{member.nextStart.viewer}</span> your time
                        {member.timeZone !== viewerZone && (
                          <>
                            {" ("}
                            <span className="tabular-nums">{member.nextStart.own}</span> theirs)
                          </>
                        )}
                      </>
                    )}
                  </p>
                </>
              )}

              {(member.offlineAfter || member.availabilityNote) && (
                <div className="border-t pt-2 text-xs text-muted-foreground">
                  {member.offlineAfter && (
                    <p>
                      Usually offline after{" "}
                      <span className="tabular-nums">{member.offlineAfter.own}</span>{" "}
                      {member.zoneAbbr}
                      {member.timeZone !== viewerZone && (
                        <>
                          {" — "}
                          <span className="tabular-nums">{member.offlineAfter.viewer}</span> your
                          time
                        </>
                      )}
                    </p>
                  )}
                  {member.availabilityNote && <p>{member.availabilityNote}</p>}
                </div>
              )}

              {(() => {
                const user = staff.find((s) => s.id === member.id);
                const todayOwn = new Intl.DateTimeFormat("en-CA", { timeZone: member.timeZone }).format(now);
                const dayLabel = new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                });
                const items = (user?.availabilityExceptions ?? [])
                  .filter((e) => e.date >= todayOwn)
                  .slice(0, 10)
                  .map((e) => ({
                    id: e.id,
                    date: e.date,
                    dateLabel: dayLabel.format(new Date(`${e.date}T12:00:00Z`)),
                    description: describeException(e),
                  }));
                return (
                  <AvailabilityExceptions
                    userId={member.id}
                    name={member.name}
                    zoneAbbr={member.zoneAbbr}
                    today={todayOwn}
                    items={items}
                    canEdit={appUser.role === "admin" || appUser.id === member.id}
                  />
                );
              })()}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** A live-reading clock for one zone, rendered on the server each request. */
function Clock({ label, zone, now }: { label: string; zone: string; now: Date }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{formatTimeInZone(now, zone)}</p>
      <p className="text-xs text-muted-foreground">
        {new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          weekday: "long",
          day: "numeric",
          month: "short",
        }).format(now)}{" "}
        · {zoneAbbreviation(now, zone)}
      </p>
    </div>
  );
}

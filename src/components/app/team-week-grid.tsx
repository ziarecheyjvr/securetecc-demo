"use client";

import { useState } from "react";
import { zoneAbbreviation } from "@/lib/timezones";
import type { WeekGrid } from "@/lib/team/week-grid";

/** What the panel under the grid says about whatever is being hovered. */
type Detail = {
  name: string;
  what: string;
  viewerTime: string;
  ownTime: string | null;
  note: string | null;
};

/**
 * Everyone's week on one clock.
 *
 * Read down for the time of day and across for the day of the week, which is
 * how a calendar is read everywhere else. Each person is a colour and holds
 * their own narrow column inside each day, so three people on the same
 * morning sit side by side rather than on top of each other.
 *
 * The whole 24 hours is drawn, not just office hours: a Manila shift lands
 * between 6pm and 3am here, and cropping the grid to 8-to-6 would hide the
 * entire team.
 */
export function TeamWeekGrid({ grid, now }: { grid: WeekGrid; now: Date }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const lanes = grid.lanes.filter((l) => l.segments.length > 0 || l.marks.length > 0);
  const viewerAbbr = zoneAbbreviation(now, grid.viewerZone);
  const otherAbbr = zoneAbbreviation(now, grid.otherZone);

  if (lanes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody has hours set yet. Add them from a person&apos;s card below and they appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {lanes.map((lane) => (
          <span key={lane.memberId} className="flex items-center gap-1.5 text-sm">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: `var(${lane.colorVar})` }}
            />
            {lane.name}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
            Left axis {viewerAbbr} · right axis {otherAbbr}
        </span>
      </div>

      {/* What the shapes mean. Without it a hatched bar is just a bar, and
          "off" and "busy with something else" read the same. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-sm bg-foreground/35" />
          SecureTECC hours — time we can book
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 rounded-sm border border-foreground/30"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--muted-foreground) 0 2px, transparent 2px 6px)",
            }}
          />
          Other — not SecureTECC time
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-sm border" style={BLOCKED_SWATCH} />
          Blocked one-off — working, but that time is taken
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-sm border" style={AWAY_SWATCH} />
          On leave or unavailable — not working at all
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0 w-4 border-t-2" style={{ borderColor: "var(--viz-teal)" }} />
          Now
        </span>
        <span>Empty space is outside someone&apos;s usual hours.</span>
      </div>

      {/* Hover detail, pinned here rather than floating over the grid: the
          grid scrolls sideways, and a popover inside a scroll container gets
          clipped exactly when it is most needed, at the edges. */}
      <div
        className="min-h-[2.75rem] rounded-md border px-3 py-2 text-xs"
        style={{ borderColor: "var(--viz-grid)", background: "var(--viz-track)" }}
        aria-live="polite"
      >
        {detail ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">{detail.name}</span>
            <span>{detail.what}</span>
            <span className="tabular-nums">{detail.viewerTime} your time</span>
            {detail.ownTime && (
              <span className="tabular-nums text-muted-foreground">{detail.ownTime} theirs</span>
            )}
            {detail.note && <span className="text-muted-foreground">· {detail.note}</span>}
          </div>
        ) : (
          <span className="text-muted-foreground">
            Point at any block to see who it is for, what it is, and the time on both clocks.
          </span>
        )}
      </div>

      {/* The grid scrolls sideways rather than squeezing seven columns onto a
          phone -- a day column narrower than its own label is unreadable. */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[46rem] gap-1">
          <TimeAxis grid={grid} side="left" />

          <div className="flex min-w-0 flex-1 gap-1">
            {grid.days.map((day, dayIndex) => (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col gap-1">
                <div
                  className={`rounded-t-md px-1 py-1 text-center text-xs font-medium ${
                    day.isToday ? "text-accent" : "text-muted-foreground"
                  }`}
                  style={
                    day.isToday
                      ? { background: "color-mix(in oklab, var(--viz-teal) 12%, transparent)" }
                      : undefined
                  }
                >
                  {day.label}
                </div>

                <div
                  className="relative h-[26rem] rounded-md border"
                  style={{
                    borderColor: "var(--viz-grid)",
                    background: day.isToday
                      ? "color-mix(in oklab, var(--viz-teal) 5%, transparent)"
                      : "var(--viz-track)",
                  }}
                >
                  {/* Hour lines, every three hours. */}
                  {grid.hours.map((h) => (
                    <div
                      key={h.topPct}
                      aria-hidden
                      className="absolute inset-x-0 border-t"
                      style={{ top: `${h.topPct}%`, borderColor: "var(--viz-grid)" }}
                    />
                  ))}

                  {/* One narrow column per person, so nobody is hidden behind
                      anybody else on a shared morning. */}
                  <div className="absolute inset-0 flex gap-[2px] p-[2px]">
                    {lanes.map((lane) => (
                      <div key={lane.memberId} className="relative min-w-0 flex-1">
                        {/* Leave, unavailable and blocked time, drawn UNDER
                            the hours: the hours are already cut around them,
                            so they fill the space the bar used to occupy. */}
                        {lane.marks
                          .filter((m) => m.dayIndex === dayIndex)
                          .map((mark, i) => (
                            <div
                              key={`m${i}`}
                              title={`${lane.name}: ${mark.label}${
                                mark.wholeDay ? "" : ` (${mark.startLabel} – ${mark.endLabel})`
                              }`}
                              tabIndex={0}
                              onMouseEnter={() =>
                                setDetail({
                                  name: lane.name,
                                  what: mark.kind === "blocked" ? "Blocked — another commitment" : "On leave or unavailable",
                                  viewerTime: mark.wholeDay ? "All day" : `${mark.startLabel} – ${mark.endLabel}`,
                                  ownTime: mark.wholeDay ? null : `${mark.ownStartLabel} – ${mark.ownEndLabel}`,
                                  note: mark.label,
                                })
                              }
                              onFocus={() =>
                                setDetail({
                                  name: lane.name,
                                  what: mark.kind === "blocked" ? "Blocked — another commitment" : "On leave or unavailable",
                                  viewerTime: mark.wholeDay ? "All day" : `${mark.startLabel} – ${mark.endLabel}`,
                                  ownTime: mark.wholeDay ? null : `${mark.ownStartLabel} – ${mark.ownEndLabel}`,
                                  note: mark.label,
                                })
                              }
                              onMouseLeave={() => setDetail(null)}
                              onBlur={() => setDetail(null)}
                              className="absolute inset-x-0 overflow-hidden rounded-[3px] border"
                              style={{
                                top: `${mark.topPct}%`,
                                height: `${mark.heightPct}%`,
                                ...(mark.kind === "blocked" ? BLOCKED_SWATCH : AWAY_SWATCH),
                              }}
                            />
                          ))}
                        {lane.segments
                          .filter((s) => s.dayIndex === dayIndex)
                          .map((segment, i) => (
                            <div
                              key={i}
                              title={`${lane.name}: ${segment.startLabel} – ${segment.endLabel}${
                                segment.label ? ` (${segment.label})` : ""
                              }${segment.kind === "Commitment" ? " — Other" : ""}`}
                              tabIndex={0}
                              onMouseEnter={() =>
                                setDetail({
                                  name: lane.name,
                                  what:
                                    segment.kind === "Commitment"
                                      ? "Other"
                                      : "SecureTECC hours",
                                  viewerTime: `${segment.startLabel} – ${segment.endLabel}`,
                                  ownTime: `${segment.ownStartLabel} – ${segment.ownEndLabel}`,
                                  note: segment.label,
                                })
                              }
                              onFocus={() =>
                                setDetail({
                                  name: lane.name,
                                  what:
                                    segment.kind === "Commitment"
                                      ? "Other"
                                      : "SecureTECC hours",
                                  viewerTime: `${segment.startLabel} – ${segment.endLabel}`,
                                  ownTime: `${segment.ownStartLabel} – ${segment.ownEndLabel}`,
                                  note: segment.label,
                                })
                              }
                              onMouseLeave={() => setDetail(null)}
                              onBlur={() => setDetail(null)}
                              className={`absolute inset-x-0 overflow-hidden px-1 text-[10px] leading-tight ${
                                segment.kind === "Commitment" ? "text-muted-foreground" : "text-white"
                              }`}
                              style={{
                                top: `${segment.topPct}%`,
                                height: `${segment.heightPct}%`,
                                // A commitment is drawn in the person's colour
                                // but hatched and faded: they are reliably
                                // busy, and it is not time we have.
                                ...(segment.kind === "Commitment"
                                  ? {
                                      backgroundImage: `repeating-linear-gradient(45deg, var(${lane.colorVar}) 0 2px, transparent 2px 6px)`,
                                      border: `1px solid color-mix(in oklab, var(${lane.colorVar}) 45%, transparent)`,
                                      opacity: 0.75,
                                    }
                                  : { background: `var(${lane.colorVar})` }),
                                // Square off the edge a block runs through, so
                                // a shift crossing midnight reads as one thing
                                // continuing rather than two that both ended.
                                borderTopLeftRadius: segment.continued ? 0 : 3,
                                borderTopRightRadius: segment.continued ? 0 : 3,
                                borderBottomLeftRadius: segment.continues ? 0 : 3,
                                borderBottomRightRadius: segment.continues ? 0 : 3,
                              }}
                            >
                              {!segment.continued && segment.heightPct > 6 && (
                                <span className="block truncate pt-[1px]">
                                  {segment.startLabel.replace(":00", "")}
                                </span>
                              )}
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>

                  {/* Now. */}
                  {grid.now?.dayIndex === dayIndex && (
                    <div
                      className="absolute inset-x-0 z-10 border-t-2"
                      style={{ top: `${grid.now.topPct}%`, borderColor: "var(--viz-teal)" }}
                    >
                      <span
                        aria-hidden
                        className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full"
                        style={{ background: "var(--viz-teal)" }}
                      />
                      <span className="sr-only">Now</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <TimeAxis grid={grid} side="right" />
        </div>
      </div>
    </div>
  );
}

/* Hatching rather than a flat colour: these are absences and commitments,
   not working hours, and a solid block of colour would read as a shift. */
const BLOCKED_SWATCH = {
  backgroundImage:
    "repeating-linear-gradient(45deg, var(--viz-warn) 0 2px, transparent 2px 5px)",
  borderColor: "color-mix(in oklab, var(--viz-warn) 55%, transparent)",
  opacity: 0.85,
} as const;

const AWAY_SWATCH = {
  backgroundImage:
    "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 5px)",
  borderColor: "var(--viz-grid)",
  color: "var(--muted-foreground)",
  opacity: 0.8,
} as const;

/** The hour scale, in the viewer's zone on the left and the other on the right. */
function TimeAxis({ grid, side }: { grid: WeekGrid; side: "left" | "right" }) {
  return (
    <div className="flex w-12 shrink-0 flex-col gap-1">
      <div className="py-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        {side === "left" ? "Local" : "Manila"}
      </div>
      <div className="relative h-[26rem]">
        {grid.hours.map((h) => (
          <span
            key={h.topPct}
            className={`absolute text-[10px] tabular-nums text-muted-foreground ${
              side === "left" ? "right-0" : "left-0"
            }`}
            style={{ top: `calc(${h.topPct}% - 0.4em)` }}
          >
            {(side === "left" ? h.viewerLabel : h.otherLabel).replace(":00", "")}
          </span>
        ))}
      </div>
    </div>
  );
}

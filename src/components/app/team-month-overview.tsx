import type { MonthOverview } from "@/lib/team/month-overview";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Two months at a glance: which days have cover, and which have none.
 *
 * One row per person per day rather than a bar chart -- the question is
 * "who, and roughly how long", and a name with a number answers it without a
 * scale to read. Hours are the viewer's day, so a Manila evening that lands
 * on the previous Pacific date is counted on the date it actually falls on.
 */
export function TeamMonthOverview({
  months,
  viewerAbbr,
  otherAbbr,
}: {
  months: MonthOverview[];
  /** The viewer's zone, named -- the days below are ITS days. */
  viewerAbbr: string;
  otherAbbr: string;
}) {
  return (
    <div className="space-y-6">
      {/* Which clock the columns follow. Without this the view looks wrong
          whenever someone's shift lands on a different date here than it does
          where they are -- a 9am Manila hour is the previous evening in
          Pacific, so it is counted on the previous day. */}
      <p className="text-xs text-muted-foreground">
        Days follow your clock ({viewerAbbr}). An {otherAbbr} shift can fall on the day before or
        after here — a 9:00 AM {otherAbbr} hour is the previous evening in {viewerAbbr}, so it
        counts on that day.
      </p>
      {months.map((month) => (
        <div key={month.label} className="space-y-2">
          <h3 className="text-sm font-semibold tracking-tight">{month.label}</h3>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="space-y-1">
            {month.weeks.map((week, i) => (
              <div key={i} className="grid grid-cols-7 gap-1">
                {week.map((day) => (
                  <div
                    key={day.date}
                    className={`min-h-[4.5rem] rounded-md border p-1 text-left ${
                      day.inMonth ? "" : "opacity-40"
                    }`}
                    style={{
                      borderColor: day.isToday ? "var(--viz-teal)" : "var(--viz-grid)",
                      background: day.isToday
                        ? "color-mix(in oklab, var(--viz-teal) 7%, transparent)"
                        : day.isWeekend
                          ? "var(--viz-track)"
                          : undefined,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className={`text-xs tabular-nums ${day.isToday ? "font-semibold text-accent" : "text-muted-foreground"}`}>
                        {day.dayOfMonth}
                      </span>
                      {day.totalHours > 0 && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {day.totalHours}h
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 space-y-0.5">
                      {day.members.map((m) => (
                        <div
                          key={m.memberId}
                          title={`${m.name}: ${m.note ?? `${m.hours}h`}`}
                          className="flex items-center gap-1 overflow-hidden rounded-[3px] px-1 text-[10px] leading-4"
                          style={
                            m.away
                              ? {
                                  backgroundImage:
                                    "repeating-linear-gradient(45deg, var(--muted-foreground) 0 1px, transparent 1px 4px)",
                                  border: "1px solid var(--viz-grid)",
                                }
                              : {
                                  background: `color-mix(in oklab, var(${m.colorVar}) 22%, transparent)`,
                                  border: `1px solid color-mix(in oklab, var(${m.colorVar}) 45%, transparent)`,
                                }
                          }
                        >
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: `var(${m.colorVar})` }}
                          />
                          <span className="min-w-0 flex-1 truncate">{m.name.split(" ")[0]}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {m.away ? "off" : `${m.hours}h`}
                          </span>
                          {m.blocked && !m.away && (
                            <span aria-hidden title="Some time blocked" style={{ color: "var(--viz-warn)" }}>
                              •
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Hours are what each person has for SecureTECC that day, on your clock. Hatched means on
        leave or unavailable; an amber dot means part of the day is blocked. Time marked Other is not
        counted.
      </p>
    </div>
  );
}

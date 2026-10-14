import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { DashboardMetrics } from "@/lib/dashboard/metrics";
import { formatHours } from "@/lib/format";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * This month's billable time against the monthly target.
 *
 * The hero figure is billable TIME -- hours logged this month at each
 * client's rate, invoiced or not -- because that is what the business
 * actually produced. Invoices raised are a separate fact and are shown
 * underneath as one, never as progress toward the target: an invoice can
 * bill last month's work, and a month's work can be invoiced next month.
 *
 * A meter, not a gauge: one ratio against a limit. The pace marker is what
 * makes it actionable -- 60% of target on the 20th of a 31-day month is
 * behind, and the bar alone can't say that.
 */
export function GoalMeter({ goal }: { goal: DashboardMetrics["goal"] }) {
  const pct = goal.target > 0 ? goal.billable / goal.target : 0;
  const filled = Math.min(1, Math.max(0, pct));
  const pacePct = goal.daysInMonth > 0 ? goal.daysElapsed / goal.daysInMonth : 0;
  const expected = goal.target * pacePct;
  const delta = goal.billable - expected;
  const onTrack = delta >= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base font-medium text-muted-foreground">
            {goal.monthLabel} billable time
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Day {goal.daysElapsed} of {goal.daysInMonth}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-semibold tabular-nums tracking-tight">
            {usd(goal.billable)}
          </span>
          <span className="text-sm text-muted-foreground">
            of {usd(goal.target)} target · {formatHours(goal.billableHours)} billable
          </span>
          <span className="ml-auto text-sm font-medium tabular-nums">
            {Math.round(pct * 100)}%
          </span>
        </div>

        <div className="space-y-2">
          <div
            className="relative h-3 w-full overflow-hidden rounded-full"
            style={{ background: "var(--viz-track)" }}
            role="meter"
            aria-valuenow={Math.round(goal.billable)}
            aria-valuemin={0}
            aria-valuemax={Math.round(goal.target)}
            aria-label={`${goal.monthLabel} billable time: ${usd(goal.billable)} of ${usd(goal.target)}`}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${filled * 100}%`, background: "var(--viz-teal)" }}
            />
            {/* Pace marker: where you'd be if the work were spread evenly. */}
            {pacePct > 0 && pacePct < 1 && (
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground/45"
                style={{ left: `${pacePct * 100}%` }}
                title={`Even pace for today: ${usd(expected)}`}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
            <span
              className="font-medium"
              style={{ color: onTrack ? "var(--viz-good)" : "var(--viz-warn)" }}
            >
              {onTrack ? "On track" : "Behind pace"} — {onTrack ? "+" : "−"}
              {usd(Math.abs(delta))} vs {usd(expected)} expected by today
            </span>
            <span className="text-muted-foreground">
              {usd(Math.max(0, goal.target - goal.billable))} to go
            </span>
          </div>
        </div>

        {/* Kept visibly apart from the figure above: invoicing is its own
            number, not progress toward the billable-time target. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span>
            Invoiced this month (separate from billable time):{" "}
            <span className="font-medium tabular-nums text-foreground">{usd(goal.invoiced)}</span>
          </span>
          <Link href="/accounting/to-bill" className={buttonVariants({ variant: "outline", size: "sm" })}>
            What&apos;s waiting to bill
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

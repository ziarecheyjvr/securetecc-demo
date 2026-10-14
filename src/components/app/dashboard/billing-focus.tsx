import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { DashboardMetrics } from "@/lib/dashboard/metrics";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * What still needs invoicing, split two ways.
 *
 * "This month" and "the backlog" are deliberately separate figures. Combined,
 * they answer neither question: what's left to bill for the month in progress
 * gets inflated by work from months nobody has invoiced yet, and the backlog
 * vanishes into a number that looks like ordinary month-to-date activity.
 */
export function BillingFocus({
  thisMonth,
  needsBilling,
  monthLabel,
}: {
  thisMonth: DashboardMetrics["thisMonth"];
  needsBilling: DashboardMetrics["needsBilling"];
  monthLabel: string;
}) {
  const backlogValue = needsBilling.reduce((s, c) => s + c.unbilledValue, 0) - thisMonth.unbilledValue;
  const backlogHours = needsBilling.reduce((s, c) => s + c.unbilledHours, 0) - thisMonth.unbilledHours;
  const overdue = needsBilling.filter((c) => c.overdue);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">To bill</CardTitle>
        <CardDescription>{monthLabel} and anything left over</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-semibold tabular-nums">{usd(thisMonth.unbilledValue)}</div>
            <div className="text-xs text-muted-foreground">
              {thisMonth.unbilledHours}h this month, not yet invoiced
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular-nums">{usd(Math.max(0, backlogValue))}</div>
            <div className="text-xs text-muted-foreground">
              {Math.max(0, Number(backlogHours.toFixed(2)))}h carried over from earlier months
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {thisMonth.billableHours}h billable logged in {monthLabel.toLowerCase()} in total, worth{" "}
          {usd(thisMonth.billableValue)}.
        </p>

        {/* The reminder Tony asked for: nothing should sit longer than its
            cadence allows, and never longer than a quarter. */}
        {overdue.length > 0 ? (
          <div
            className="rounded-lg border p-3"
            style={{
              borderColor: "var(--viz-warn)",
              background: "color-mix(in oklab, var(--viz-warn) 8%, transparent)",
            }}
          >
            <p className="text-sm font-medium">
              {overdue.length} client{overdue.length === 1 ? "" : "s"} overdue to be billed
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              Unbilled work older than their billing cycle allows.
            </p>
            <ul className="space-y-1">
              {overdue.slice(0, 5).map((c) => (
                <li key={c.clientId} className="flex items-center gap-2 text-sm">
                  <Link href={`/clients/${c.clientId}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.cadence}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
                    oldest {c.oldestEntryDays}d
                  </span>
                  <span className="shrink-0 tabular-nums">{usd(c.unbilledValue)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing is overdue to be billed — every client is within their cycle.
          </p>
        )}

        <Link href="/invoices/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Generate an invoice
        </Link>
      </CardContent>
    </Card>
  );
}

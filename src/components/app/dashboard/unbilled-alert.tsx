import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { DashboardMetrics } from "@/lib/dashboard/metrics";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * Unbilled work, at the top of the page where it can't be missed.
 *
 * The "To bill" card further down has carried this for a while and it is
 * still possible to open the dashboard, read the revenue chart and leave
 * without ever seeing it. Work that was done but never invoiced is the one
 * number where not noticing costs real money.
 *
 * It is NOT shown whenever anything at all is unbilled -- there is almost
 * always something, and a banner that is always there is furniture. It
 * appears when one of two things is true:
 *
 *  - something has waited longer than that client's billing cycle allows
 *    (Tony's rule: nothing goes past a quarter), or
 *  - the total has reached a quarter of the month's revenue goal, which is
 *    the org's own definition of a material amount rather than a number
 *    invented here.
 */
export function UnbilledAlert({
  needsBilling,
  monthlyGoal,
}: {
  needsBilling: DashboardMetrics["needsBilling"];
  monthlyGoal: number;
}) {
  if (needsBilling.length === 0) return null;

  const value = needsBilling.reduce((s, c) => s + c.unbilledValue, 0);
  const hours = needsBilling.reduce((s, c) => s + c.unbilledHours, 0);
  const overdue = needsBilling.filter((c) => c.overdue);
  const oldestDays = Math.max(...needsBilling.map((c) => c.oldestEntryDays));

  // No goal set yet is not a reason to go quiet -- fall back to a plain
  // figure so a new org still gets the warning.
  const threshold = monthlyGoal > 0 ? monthlyGoal * 0.25 : 2000;
  if (overdue.length === 0 && value < threshold) return null;

  const worst = [...needsBilling].sort((a, b) => b.unbilledValue - a.unbilledValue).slice(0, 3);

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--viz-warn)",
        background: "color-mix(in oklab, var(--viz-warn) 10%, transparent)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* Status is carried by the icon and the sentence, never colour
                alone. */}
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: "var(--viz-warn)" }}
            >
              !
            </span>
            <p className="text-sm font-medium">
              {usd(value)} of billable work is waiting to be invoiced
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {Number(hours.toFixed(2))}h across {needsBilling.length} client
            {needsBilling.length === 1 ? "" : "s"} · oldest entry {oldestDays} day
            {oldestDays === 1 ? "" : "s"} ago
            {overdue.length > 0 &&
              ` · ${overdue.length} past their billing cycle`}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Link
            href="/accounting/to-bill"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            See it all
          </Link>
          <Link href="/invoices/new" className={buttonVariants({ size: "sm" })}>
            Generate an invoice
          </Link>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {worst.map((c) => (
          <li key={c.clientId} className="text-xs">
            <Link href={`/clients/${c.clientId}`} className="font-medium hover:underline">
              {c.name}
            </Link>{" "}
            <span className="tabular-nums text-muted-foreground">
              {usd(c.unbilledValue)} · {c.oldestEntryDays}d
              {c.overdue ? " · overdue" : ""}
            </span>
          </li>
        ))}
        {needsBilling.length > worst.length && (
          <li className="text-xs">
            {/* The rest of the list is a report, not a longer banner: this is
                the dashboard, and everything past the worst few belongs on a
                page built to be read. */}
            <Link href="/accounting/to-bill" className="text-muted-foreground hover:underline">
              +{needsBilling.length - worst.length} more →
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { loadMonthlyPosition, resolveMonth } from "@/lib/reports/monthly-position";
import { AccountingTabs } from "@/components/app/accounting-tabs";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatHours } from "@/lib/format";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * One month, top to bottom: what came in, what it cost to run, what is left.
 *
 * Revenue lines stay separate, and invoices and payments are shown for
 * reference only -- see lib/reports/monthly-position.ts for why adding them
 * in would count the same work twice.
 */
export default async function MonthlyPositionPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { month } = resolveMonth(monthParam);
  const { data } = await requireAdminContext((tx) => loadMonthlyPosition(tx, month));
  const p = data!;
  const noCosts = p.costs.total === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">
          Where the money is: what is unbilled, what is owed, and what it cost.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AccountingTabs />
        <div className="flex items-center gap-2">
          <Link
            href={`/accounting/monthly?month=${shiftMonth(p.month, -1)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-36 text-center text-sm font-medium">{p.label}</span>
          <Link
            href={`/accounting/monthly?month=${shiftMonth(p.month, 1)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href="/settings/expenses" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Manage costs
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Headline label="Gross monthly revenue" value={usd(p.revenue.gross)} />
        <Headline label="Monthly operating costs" value={usd(p.costs.total)} />
        <Headline
          label="Net operating position"
          value={usd(p.net)}
          tone={p.net >= 0 ? "good" : "warn"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revenue</CardTitle>
            <CardDescription>Three kinds of income, kept separate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <Line
              label="Billable time"
              hint={`${formatHours(p.revenue.billableHours)} logged this month, at each client's rate`}
              value={p.revenue.billableTime}
            />
            <Line
              label="Recurring charges"
              hint={`${p.revenue.recurringCount} active · annual charges counted as a twelfth`}
              value={p.revenue.recurring}
            />
            <Line
              label="Client retainers"
              hint={
                p.revenue.retainerCount === 0
                  ? "No clients on a retainer"
                  : `${p.revenue.retainerCount} client${p.revenue.retainerCount === 1 ? "" : "s"}`
              }
              value={p.revenue.retainers}
            />
            <Line label="Gross monthly revenue" value={p.revenue.gross} total />

            <div className="mt-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">For reference — not added above</p>
              <p className="flex justify-between gap-3">
                <span>Invoices raised this month</span>
                <span className="tabular-nums">{usd(p.reference.invoiced)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span>Payments received this month</span>
                <span className="tabular-nums">{usd(p.reference.paymentsReceived)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span>SecureTECC internal work (non-billable)</span>
                <span className="tabular-nums">{formatHours(p.reference.internalHours)}</span>
              </p>
              <p className="mt-1">
                An invoice can bill an earlier month&apos;s work, so adding it in would count that
                work twice. Internal work is tracked in hours only — it is never billed and never
                counts as revenue.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Operating costs</CardTitle>
            <CardDescription>
              From the costs entered under Manage costs, by category. Annual costs count as a
              twelfth.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {p.costs.byCategory.map((c) => (
              <Line
                key={c.category}
                label={c.category}
                hint={c.items.length === 0 ? "Nothing entered yet" : c.items.map((i) => i.name).join(", ")}
                value={c.amount}
                muted={c.items.length === 0}
              />
            ))}
            <Line
              label="Cost of recurring services"
              hint="The cost recorded on each recurring charge"
              value={p.costs.recurringDelivery}
              muted={p.costs.recurringDelivery === 0}
            />
            <Line label="Monthly operating costs" value={p.costs.total} total />
            {noCosts && (
              <p className="pt-3 text-xs text-muted-foreground">
                No costs are entered yet, so the net position above is revenue only. Add software,
                hosting, mailbox and subscription costs under{" "}
                <Link href="/settings/expenses" className="underline underline-offset-2">
                  Manage costs
                </Link>{" "}
                and they appear here in their category.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Headline({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className="text-2xl tabular-nums"
          style={tone ? { color: tone === "good" ? "var(--viz-good)" : "var(--viz-warn)" } : undefined}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function Line({
  label,
  hint,
  value,
  total,
  muted,
}: {
  label: string;
  hint?: string;
  value: number;
  total?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${total ? "mt-1 border-t pt-2.5 font-semibold" : ""}`}>
      <span className="min-w-0">
        <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
        {hint && <span className="block truncate text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${muted ? "text-muted-foreground" : ""}`}>{usd(value)}</span>
    </div>
  );
}

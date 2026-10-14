import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { DashboardMetrics } from "@/lib/dashboard/metrics";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * Sent vs paid, and who needs chasing.
 *
 * The two statuses get a shared bar rather than a chart apiece: the question
 * isn't "how much was sent" or "how much was paid" separately, it's what
 * share of what went out has actually come back. One bar answers that at a
 * glance; two charts make you do the division yourself.
 */
export function Collections({
  collections,
  awaitingPayment,
  paymentMethods,
}: {
  collections: DashboardMetrics["collections"];
  awaitingPayment: DashboardMetrics["awaitingPayment"];
  paymentMethods: DashboardMetrics["paymentMethods"];
}) {
  const { sentValue, paidValue, overdueValue } = collections;
  const total = sentValue + paidValue;
  const paidShare = total > 0 ? paidValue / total : 0;
  const overdue = awaitingPayment.filter((i) => i.overdue);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sent vs paid</CardTitle>
        <CardDescription>
          {total > 0
            ? `${Math.round(paidShare * 100)}% of invoiced value has been collected.`
            : "Nothing invoiced in this period yet."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-track)" }}>
            {paidValue > 0 && (
              <div
                style={{ width: `${(paidValue / Math.max(total, 1)) * 100}%`, background: "var(--viz-3)", marginRight: 2 }}
                title={`Paid ${usd(paidValue)}`}
              />
            )}
            {sentValue > 0 && (
              <div
                style={{ width: `${(sentValue / Math.max(total, 1)) * 100}%`, background: "var(--viz-1)" }}
                title={`Awaiting payment ${usd(sentValue)}`}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-3)" }} />
              <span className="text-muted-foreground">Paid</span>
              <span className="tabular-nums">{usd(paidValue)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-1)" }} />
              <span className="text-muted-foreground">Awaiting payment</span>
              <span className="tabular-nums">{usd(sentValue)}</span>
            </span>
          </div>
        </div>

        {/* The actionable half: which invoices are old enough to chase. */}
        {overdue.length > 0 ? (
          <div
            className="rounded-lg border p-3"
            style={{
              borderColor: "var(--viz-warn)",
              background: "color-mix(in oklab, var(--viz-warn) 8%, transparent)",
            }}
          >
            <p className="text-sm font-medium">
              {overdue.length} invoice{overdue.length === 1 ? "" : "s"} unpaid for over 30 days —{" "}
              {usd(overdueValue)}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">Worth a payment reminder.</p>
            <ul className="space-y-1">
              {overdue.slice(0, 5).map((inv) => (
                <li key={inv.id} className="flex items-center gap-2 text-sm">
                  <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                    {inv.invoiceNumber}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {inv.clientName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {inv.daysSinceSent}d
                  </span>
                  <span className="shrink-0 tabular-nums">{usd(inv.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : awaitingPayment.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {awaitingPayment.length} invoice{awaitingPayment.length === 1 ? "" : "s"} awaiting
            payment, none older than 30 days.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
        )}

        {/* How the money actually arrived. Sits under the paid figure because
            it is a breakdown OF that number, not a separate statistic. */}
        {paymentMethods.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="label-hud opacity-70">How it was paid</p>
            {paymentMethods.map((m) => (
              <div key={m.method} className="flex items-center gap-3 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: m.method === "Not recorded" ? "var(--viz-other)" : "var(--viz-teal)" }}
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{m.method}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {m.count} {m.count === 1 ? "invoice" : "invoices"}
                </span>
                <span className="shrink-0 tabular-nums">{usd(m.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <Link href="/invoices?status=Sent" className={buttonVariants({ variant: "outline", size: "sm" })}>
          View sent invoices
        </Link>
      </CardContent>
    </Card>
  );
}

/** Unresolved tickets, surfaced where the day starts. */
export function TicketAttention({ tickets }: { tickets: DashboardMetrics["tickets"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Open tickets</CardTitle>
        <CardDescription>
          {tickets.open === 0
            ? "Nothing open."
            : `${tickets.newCount} new · ${tickets.inProgress} in progress`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tickets.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unresolved tickets.</p>
        ) : (
          <ul className="space-y-2">
            {tickets.recent.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <Link href={`/tickets/${t.id}`} className="font-medium hover:underline">
                  {t.ticketNumber}
                </Link>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.company}</span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs"
                  style={
                    t.urgency === "Emergency" || t.urgency === "Critical" || t.urgency === "High"
                      ? {
                          color: "var(--viz-warn)",
                          background: "color-mix(in oklab, var(--viz-warn) 12%, transparent)",
                        }
                      : { color: "var(--muted-foreground)" }
                  }
                >
                  {t.urgency}
                </span>
                <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
                  {t.ageDays}d
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/tickets" className={buttonVariants({ variant: "outline", size: "sm" })}>
          View all tickets
        </Link>
      </CardContent>
    </Card>
  );
}

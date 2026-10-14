import Link from "next/link";
import { Suspense } from "react";
import { requireAdminContext } from "@/lib/auth";
import { resolveRange } from "@/lib/dashboard/metrics";
import { loadReports } from "@/lib/reports/metrics";
import { AccountingTabs } from "@/components/app/accounting-tabs";
import { RangeFilter } from "@/components/app/dashboard/range-filter";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/**
 * Revenue against what it cost to earn it.
 *
 * Moved off the dashboard deliberately: the dashboard answers "what do I need
 * to know today", and margin per client is a question you sit down with.
 */
export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to);
  const { data } = await requireAdminContext((tx) => loadReports(tx, range));
  const { profitability } = data!;

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
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <RangeFilter current={range.key} from={sp.from} to={sp.to} />
          </Suspense>
          <Link
            href="/settings/expenses"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Manage costs
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{range.label}</CardTitle>
          <CardDescription>
            A cost attached to a client is set against what that client was billed. Overhead is
            reported separately and deliberately not split across clients — an invented split makes
            a per-client profit look precise when it is a guess.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Figure label="Invoiced" value={usd(profitability.revenue)} />
            <Figure label="Direct costs" value={usd(profitability.directCosts)} hint="attached to a client" />
            <Figure label="Overhead" value={usd(profitability.overhead)} hint="not client-specific" />
            <Figure
              label="Net"
              value={usd(profitability.netProfit)}
              hint={
                profitability.revenue > 0
                  ? `${Math.round((profitability.netProfit / profitability.revenue) * 100)}% of invoiced`
                  : "nothing invoiced"
              }
              emphasis
            />
          </div>

          {profitability.clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No costs recorded yet. Add them in Settings → Expenses and this fills itself.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Direct cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitability.clients.map((c) => (
                  <TableRow key={c.clientId}>
                    <TableCell className="font-medium">
                      <Link href={`/clients/${c.clientId}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usd(c.invoiced)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.directCost > 0 ? usd(c.directCost) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {usd(c.margin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {c.marginRatio === null ? "—" : `${Math.round(c.marginRatio * 100)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${emphasis ? "text-accent" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

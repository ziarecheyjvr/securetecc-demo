import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { pacificDayStart } from "@/lib/cron/pacific";
import { loadToBill } from "@/lib/reports/to-bill";
import { AccountingTabs } from "@/components/app/accounting-tabs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/**
 * Everything done and not yet invoiced.
 *
 * The dashboard says how much and how old; this is the list behind it, at the
 * detail needed to actually raise the invoices.
 */
export default async function ToBillPage() {
  const { data: report } = await requireAdminContext((tx) => loadToBill(tx, pacificDayStart()));

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
        <Link href="/invoices/new" className={buttonVariants({ size: "sm" })}>
          Generate an invoice
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {usd(report!.totalValue)} waiting to be invoiced
          </CardTitle>
          <CardDescription>
            {report!.totalHours.toFixed(2)} unbilled hours across {report!.clients.length} client
            {report!.clients.length === 1 ? "" : "s"}. Oldest first — age is what makes a row
            urgent, not the amount. No date filter: unbilled work does not expire, and the entry
            nobody noticed is the point of this page.
            {report!.unratedCount > 0 && (
              <>
                {" "}
                <strong className="text-[var(--viz-warn)]">
                  {report!.unratedCount} entr{report!.unratedCount === 1 ? "y has" : "ies have"} no
                  resolvable rate
                </strong>{" "}
                and cannot be invoiced until one is set.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Oldest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report!.clients.map((c) => (
                <TableRow key={c.clientId}>
                  <TableCell className="font-medium">
                    <Link href={`/clients/${c.clientId}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.cadence}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.hours.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(c.timeValue)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.expenseValue > 0 ? usd(c.expenseValue) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {usd(c.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.overdue ? (
                      <Badge variant="secondary" className="tabular-nums">
                        {c.oldestDays}d past cycle
                      </Badge>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">{c.oldestDays}d</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {report!.clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nothing unbilled. Everything logged has been invoiced.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {report!.entries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Unbilled time</CardTitle>
            <CardDescription>Every entry, with who did it and what it is worth.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Performed by</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report!.entries.map((e) => (
                  <TableRow key={e.id} data-unrated={e.rate === null || undefined}>
                    <TableCell className="whitespace-nowrap">{e.date}</TableCell>
                    <TableCell>{e.clientName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="font-mono text-xs">{e.serviceCode}</span>
                      <span className="ml-2 text-muted-foreground">{e.serviceLabel}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{e.performedBy}</TableCell>
                    <TableCell className="max-w-xs truncate" title={e.description}>
                      {e.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.hours.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.rate === null ? (
                        <span className="text-[var(--viz-warn)]">no rate</span>
                      ) : (
                        usd(e.rate)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.amount === null ? "—" : usd(e.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {e.ageDays}d
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {report!.expenses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Unbilled expenses</CardTitle>
            <CardDescription>
              Reimbursable costs not yet on an invoice. They carry no margin — they are passed
              through at cost.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report!.expenses.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="whitespace-nowrap">{x.date}</TableCell>
                    <TableCell>{x.clientName}</TableCell>
                    <TableCell>{x.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(x.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {x.ageDays}d
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

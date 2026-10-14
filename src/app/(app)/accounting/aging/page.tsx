import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { buildAging, AGING_LABELS, type AgingBucket } from "@/lib/reports/aging";
import { AccountingTabs } from "@/components/app/accounting-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const BUCKETS: AgingBucket[] = ["current", "d31_60", "d61_90", "d90plus"];

/**
 * Who owes money, and how old the receivable is.
 *
 * Counted from the day each invoice was SENT — that is when the client's
 * clock starts — and part-paid invoices contribute only their balance, so the
 * total is what is actually outstanding rather than the sum of the paper.
 */
export default async function AgingPage() {
  const { data } = await requireAdminContext(async (tx) => {
    const [invoices, org] = await Promise.all([
      tx.invoice.findMany({
        where: { voidedAt: null, status: { in: ["Invoiced", "Sent"] } },
        select: {
          id: true,
          invoiceNumber: true,
          clientId: true,
          status: true,
          totalAmount: true,
          sentAt: true,
          issuedAt: true,
          createdAt: true,
          client: { select: { name: true } },
          payments: { select: { amount: true, receivedAt: true, method: true, methodOther: true } },
        },
      }),
      tx.organization.findFirstOrThrow({ select: { paymentTermsDays: true } }),
    ]);

    return buildAging(
      invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        clientId: i.clientId,
        clientName: i.client.name,
        status: i.status,
        totalAmount: Number(i.totalAmount),
        sentAt: i.sentAt,
        issuedAt: i.issuedAt,
        createdAt: i.createdAt,
        payments: i.payments.map((p) => ({
          amount: Number(p.amount),
          receivedAt: p.receivedAt,
          method: p.method,
          methodOther: p.methodOther,
        })),
      })),
      new Date(),
      org.paymentTermsDays,
    );
  });

  const report = data!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">
          Where the money is: what is unbilled, what is owed, and what it cost.
        </p>
      </div>

      <AccountingTabs />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{usd(report.totals.total)} outstanding</CardTitle>
          <CardDescription>
            Counted from the day each invoice was sent, because that is when the client&apos;s clock
            starts. A part-paid invoice counts only its balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            {BUCKETS.map((bucket) => (
              <div key={bucket} className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {AGING_LABELS[bucket]}
                </p>
                <p
                  className="text-lg font-semibold tabular-nums"
                  style={
                    bucket === "d90plus" && report.totals[bucket] > 0
                      ? { color: "var(--viz-warn)" }
                      : undefined
                  }
                >
                  {usd(report.totals[bucket])}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">By client</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing outstanding — every invoice raised has been paid.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  {BUCKETS.map((b) => (
                    <TableHead key={b} className="text-right">
                      {AGING_LABELS[b]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => (
                  <TableRow key={r.clientId}>
                    <TableCell className="font-medium">
                      <Link href={`/clients/${r.clientId}`} className="hover:underline">
                        {r.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        oldest {r.oldestDays}d
                      </span>
                    </TableCell>
                    {BUCKETS.map((b) => (
                      <TableCell key={b} className="text-right tabular-nums">
                        {r[b] ? usd(r[b]) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {usd(r.total)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Total owed</TableCell>
                  {BUCKETS.map((b) => (
                    <TableCell key={b} className="text-right font-semibold tabular-nums">
                      {usd(report.totals[b])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {usd(report.totals.total)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {report.invoices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Every open invoice</CardTitle>
            <CardDescription>
              Oldest first. An invoice that has not been sent has no due date — it is not late, it
              is unsent, which is a different problem and one on our side of the desk.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="whitespace-nowrap">Invoice date</TableHead>
                  <TableHead className="whitespace-nowrap">Sent</TableHead>
                  <TableHead className="whitespace-nowrap">Due</TableHead>
                  <TableHead className="text-right">Days out</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${i.id}`} className="hover:underline">
                        {i.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{i.clientName}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(i.invoiceDate)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {i.sentAt ? formatDate(i.sentAt) : "not sent"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {i.dueDate ? formatDate(i.dueDate) : "—"}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      style={i.daysOverdue > 0 ? { color: "var(--viz-warn)" } : undefined}
                    >
                      {i.daysOverdue > 0 ? `${i.daysOverdue}d late` : `${i.days}d`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usd(i.total)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {i.paid > 0 ? usd(i.paid) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {usd(i.balance)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {AGING_LABELS[i.bucket]}
                    </TableCell>
                    <TableCell>
                      <Badge variant={i.paid > 0 ? "default" : "secondary"}>
                        {i.paid > 0 ? "Part paid" : i.status}
                      </Badge>
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

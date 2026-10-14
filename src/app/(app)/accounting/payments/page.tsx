import Link from "next/link";
import { Suspense } from "react";
import { requireAdminContext } from "@/lib/auth";
import { PACIFIC_TZ, pacificDayStart } from "@/lib/cron/pacific";
import { settle, methodLabel } from "@/lib/billing/payments";
import { monthBounds, monthLabelOf } from "@/lib/month";
import { AccountingTabs } from "@/components/app/accounting-tabs";
import { MonthPicker } from "@/components/app/month-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/**
 * Who has paid this month, and who has not.
 *
 * Two questions that should never require opening individual invoices. Paid
 * is driven by payments RECEIVED in the month, not by invoices raised in it --
 * money arriving in September against a July invoice is September's answer to
 * "who has paid".
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: requested } = await searchParams;
  const today = pacificDayStart();
  const thisMonth = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: PACIFIC_TZ,
  })
    .format(today)
    .slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested! : thisMonth;
  const bounds = monthBounds(month)!;

  const { data } = await requireAdminContext(async (tx) => {
    const [received, open] = await Promise.all([
      tx.payment.findMany({
        where: { receivedAt: { gte: bounds.start, lt: bounds.end } },
        select: {
          id: true,
          amount: true,
          receivedAt: true,
          method: true,
          methodOther: true,
          reference: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              client: { select: { id: true, name: true } },
              payments: { select: { amount: true, receivedAt: true, method: true, methodOther: true } },
            },
          },
        },
        orderBy: { receivedAt: "asc" },
      }),
      tx.invoice.findMany({
        where: { voidedAt: null, status: { in: ["Invoiced", "Sent"] } },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          sentAt: true,
          issuedAt: true,
          createdAt: true,
          client: { select: { id: true, name: true } },
          payments: { select: { amount: true, receivedAt: true, method: true, methodOther: true } },
        },
        orderBy: [{ sentAt: "asc" }],
      }),
    ]);
    return { received, open };
  });

  const received = data!.received;
  const open = data!.open;
  const receivedTotal = received.reduce((s, p) => s + Number(p.amount), 0);

  const owed = open.map((i) => {
    const s = settle(
      Number(i.totalAmount),
      i.payments.map((p) => ({
        amount: Number(p.amount),
        receivedAt: p.receivedAt,
        method: p.method,
        methodOther: p.methodOther,
      })),
    );
    return { invoice: i, settlement: s };
  });
  const owedTotal = owed.reduce((s, r) => s + r.settlement.balance, 0);

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
        <Suspense fallback={null}>
          <MonthPicker month={month} />
        </Suspense>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Paid in {monthLabelOf(month)}</CardTitle>
          <CardDescription>
            {usd(receivedTotal)} received across {received.length} payment
            {received.length === 1 ? "" : "s"}. Counted by the day the money arrived, so a payment
            in {monthLabelOf(month)} against an older invoice belongs here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {received.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing received in {monthLabelOf(month)}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Settles it</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {received.map((p) => {
                  const s = settle(
                    Number(p.invoice.totalAmount),
                    p.invoice.payments.map((x) => ({
                      amount: Number(x.amount),
                      receivedAt: x.receivedAt,
                      method: x.method,
                      methodOther: x.methodOther,
                    })),
                  );
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(p.receivedAt)}</TableCell>
                      <TableCell>
                        <Link href={`/clients/${p.invoice.client.id}`} className="hover:underline">
                          {p.invoice.client.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/invoices/${p.invoice.id}`} className="hover:underline">
                          {p.invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{methodLabel(p.method, p.methodOther)}</TableCell>
                      <TableCell className="max-w-[12rem] truncate text-muted-foreground">
                        {p.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {usd(Number(p.amount))}
                      </TableCell>
                      <TableCell>
                        {s.balance > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {usd(s.balance)} still owed
                          </span>
                        ) : (
                          <Badge>Paid in full</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell colSpan={5} className="font-semibold">
                    Total received
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {usd(receivedTotal)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Not paid</CardTitle>
          <CardDescription>
            {usd(owedTotal)} outstanding across {owed.length} invoice{owed.length === 1 ? "" : "s"}.
            This is every open invoice regardless of month — an unpaid invoice does not stop being
            unpaid because the calendar moved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {owed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everything raised has been paid.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="whitespace-nowrap">Sent</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owed.map(({ invoice, settlement }) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      <Link href={`/clients/${invoice.client.id}`} className="hover:underline">
                        {invoice.client.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                        {invoice.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {invoice.sentAt ? formatDate(invoice.sentAt) : "not sent"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(Number(invoice.totalAmount))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {settlement.received > 0 ? usd(settlement.received) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {usd(settlement.balance)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={5} className="font-semibold">
                    Total outstanding
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {usd(owedTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

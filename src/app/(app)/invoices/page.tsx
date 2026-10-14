import Link from "next/link";
import { Suspense } from "react";
import { requireOrgContext } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceRowActions } from "@/components/app/invoice-actions";
import { ListSearch } from "@/components/app/list-search";
import { methodLabel, SETTLEMENT_LABELS, settle } from "@/lib/billing/payments";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { pacificDayStart } from "@/lib/cron/pacific";
import { formatCurrency, formatDate, formatHours } from "@/lib/format";
import { Plus } from "lucide-react";

/**
 * "Current" is the money question: everything raised and not yet settled,
 * oldest first, so the top of the list is what has been waiting longest. All
 * is the complete record, newest first, and still includes voided invoices --
 * an "All" that hides some invoices is not all.
 */
const FILTERS = ["Current", "All", "Draft", "Invoiced", "Sent", "Paid", "Voided"] as const;
type Filter = (typeof FILTERS)[number];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const active: Filter = FILTERS.includes(status as Filter) ? (status as Filter) : "Current";
  const search = (q ?? "").trim();
  const outstanding = active === "Current";

  const { data: invoices } = await requireOrgContext((tx) =>
    tx.invoice.findMany({
      where: {
        ...(outstanding
          ? {
              // Not Draft: a draft is not owed yet, it is not even an invoice.
              // Not voided. Anything else that is not Paid is money out there.
              voidedAt: null,
              status: { in: ["Invoiced", "Sent"] },
            }
          : active === "All"
            ? {}
            : active === "Voided"
              ? { voidedAt: { not: null } }
              : { status: active, voidedAt: null }),
        ...(search
          ? {
              OR: [
                { invoiceNumber: { contains: search, mode: "insensitive" as const } },
                { client: { name: { contains: search, mode: "insensitive" as const } } },
                { payments: { some: { reference: { contains: search, mode: "insensitive" as const } } } },
                { payments: { some: { methodOther: { contains: search, mode: "insensitive" as const } } } },
                ...(PAYMENT_METHODS.some((m) => m.toLowerCase() === search.toLowerCase())
                  ? [{ paymentMethod: search as (typeof PAYMENT_METHODS)[number] }]
                  : []),
              ],
            }
          : {}),
      },
      include: {
        client: { select: { name: true } },
        payments: { select: { amount: true, receivedAt: true, method: true, methodOther: true } },
      },
      // Outstanding reads oldest-first: the top of the list is the invoice
      // that has been waiting longest, which is where chasing starts.
      orderBy: outstanding
        ? [{ issuedAt: "asc" }, { createdAt: "asc" }]
        : [{ createdAt: "desc" }],
    }),
  );

  const today = pacificDayStart();
  const rows = invoices.map((invoice) => {
    const settlement = settle(
      Number(invoice.totalAmount),
      invoice.payments.map((p) => ({
        amount: Number(p.amount),
        receivedAt: p.receivedAt,
        method: p.method,
        methodOther: p.methodOther,
      })),
    );
    // Counted from when it was SENT -- the clock on a client starts when they
    // received it, not when it was drafted. Falls back to the issue date for
    // anything finalised but never emailed.
    const since = invoice.sentAt ?? invoice.issuedAt;
    return {
      invoice,
      settlement,
      daysOutstanding: since
        ? Math.max(0, Math.floor((today.getTime() - since.getTime()) / 86_400_000))
        : null,
    };
  });

  const outstandingTotal = rows.reduce((s, r) => s + r.settlement.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            {outstanding
              ? `${rows.length} outstanding · ${formatCurrency(outstandingTotal)} owed`
              : `${rows.length} ${active === "All" ? "total" : active.toLowerCase()}`}
          </p>
        </div>
        <Button render={<Link href="/invoices/new" />}>
          <Plus className="mr-1 h-4 w-4" /> Generate invoice
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              variant={f === active ? "default" : "outline"}
              size="sm"
              render={
                <Link
                  href={`/invoices?status=${f}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                />
              }
            >
              {f}
            </Button>
          ))}
        </div>
        <Suspense fallback={null}>
          <ListSearch
            initial={search}
            label="Search invoices"
            placeholder="Search number, client, method, reference…"
          />
        </Suspense>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Client</TableHead>
              {outstanding ? (
                <TableHead className="whitespace-nowrap">Invoice date</TableHead>
              ) : (
                <TableHead>Period</TableHead>
              )}
              {!outstanding && <TableHead className="text-right">Hours</TableHead>}
              <TableHead className="text-right">Total</TableHead>
              {outstanding && <TableHead className="text-right">Balance</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="whitespace-nowrap">Sent</TableHead>
              {outstanding ? (
                <TableHead className="whitespace-nowrap text-right">Days out</TableHead>
              ) : (
                <TableHead className="whitespace-nowrap">Paid</TableHead>
              )}
              <TableHead>Method</TableHead>
              <TableHead className="w-[9rem]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ invoice, settlement, daysOutstanding }) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">
                  <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>{invoice.client.name}</TableCell>
                {outstanding ? (
                  <TableCell className="whitespace-nowrap">
                    {invoice.issuedAt ? formatDate(invoice.issuedAt) : formatDate(invoice.createdAt)}
                  </TableCell>
                ) : (
                  <TableCell className="whitespace-nowrap">
                    {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                  </TableCell>
                )}
                {!outstanding && (
                  <TableCell className="text-right">
                    {formatHours(Number(invoice.totalHours))}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  {formatCurrency(Number(invoice.totalAmount))}
                </TableCell>
                {outstanding && (
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(settlement.balance)}
                  </TableCell>
                )}
                <TableCell>
                  {invoice.voidedAt ? (
                    <Badge variant="secondary">Voided</Badge>
                  ) : (
                    // Draft is the only state that is not yet a real invoice,
                    // so it reads as an outline; Invoiced onward is filled.
                    <Badge
                      variant={
                        invoice.status === "Paid"
                          ? "default"
                          : invoice.status === "Draft"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {/* Part paid is the honest label when money has arrived
                          but not all of it -- "Sent" hides that anything was
                          received, "Paid" claims too much. */}
                      {settlement.state === "PartPaid"
                        ? SETTLEMENT_LABELS.PartPaid
                        : invoice.status}
                    </Badge>
                  )}
                </TableCell>
                {/* Sent/paid/method sit next to the status because the
                    question is never "is it paid" alone -- it is "paid when,
                    and how", which is what reconciling against a bank
                    statement actually needs. */}
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {invoice.sentAt ? formatDate(invoice.sentAt) : "—"}
                </TableCell>
                {outstanding ? (
                  <TableCell
                    className={`whitespace-nowrap text-right tabular-nums ${
                      daysOutstanding !== null && daysOutstanding > 30
                        ? "font-medium text-[var(--viz-warn)]"
                        : "text-muted-foreground"
                    }`}
                  >
                    {daysOutstanding === null ? "—" : `${daysOutstanding}d`}
                  </TableCell>
                ) : (
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {invoice.paidAt ? formatDate(invoice.paidAt) : "—"}
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">
                  {invoice.paymentMethod
                    ? methodLabel(
                        invoice.paymentMethod,
                        invoice.payments.find((p) => p.method === "Other")?.methodOther,
                      )
                    : "—"}
                </TableCell>
                <TableCell>
                  <InvoiceRowActions
                    invoiceId={invoice.id}
                    status={invoice.status}
                    voided={!!invoice.voidedAt}
                  />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  {search
                    ? `Nothing matches “${search}”.`
                    : outstanding
                      ? "Nothing outstanding — every invoice raised has been paid."
                      : active === "All"
                        ? "No invoices yet."
                        : `No ${active.toLowerCase()} invoices.`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

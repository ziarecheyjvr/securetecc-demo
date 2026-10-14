import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceCustomItems } from "@/components/app/invoice-custom-items";
import { InvoicePaymentDetails } from "@/components/app/invoice-payment-details";
import { InvoicePayments } from "@/components/app/invoice-payments";
import { settle } from "@/lib/billing/payments";
import {
  ConfirmInvoiceButton,
  MarkPaidButton,
  RetryPdfButton,
  SendInvoiceActions,
  VoidInvoiceDialog,
} from "@/components/app/invoice-actions";
import { isGoogleConfigured } from "@/lib/google/auth";
import { formatAddressLine, formatCurrency, formatDate, formatHours } from "@/lib/format";
import { Download } from "lucide-react";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { appUser, authUserId, data: invoice } = await requireOrgContext((tx) =>
    tx.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        organization: { select: { emailDomainVerified: true } },
        timeEntries: { include: { serviceType: true }, orderBy: { date: "asc" } },
        recurringCharges: true,
        reimbursableExpenses: { orderBy: { date: "asc" } },
        payments: { orderBy: { receivedAt: "asc" } },
        customItems: { orderBy: { sortOrder: "asc" } },
      },
    }),
  );

  if (!invoice) notFound();

  // The draft is signed with one of the signed-in user's own signatures.
  const signatures = await withRLS(authUserId, (tx) =>
    tx.emailSignature.findMany({
      where: { ownerUserId: appUser.id },
      select: { id: true, name: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
  );

  const isAdmin = appUser.role === "admin";
  const voided = Boolean(invoice.voidedAt);
  const clientRate = invoice.client.billingRate ? Number(invoice.client.billingRate) : null;
  const addressLine = formatAddressLine(invoice.client.address1, invoice.client.address2);

  // The invoice's own status columns are a cache of these rows; the rows are
  // the record. See lib/billing/payments.ts.
  const settlement = settle(
    Number(invoice.totalAmount),
    invoice.payments.map((p) => ({
      amount: Number(p.amount),
      receivedAt: p.receivedAt,
      method: p.method,
      methodOther: p.methodOther,
    })),
  );

  const monthly = invoice.recurringCharges.filter((c) => c.billingFrequency === "Monthly");
  const annual = invoice.recurringCharges.filter((c) => c.billingFrequency === "Annual");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{invoice.invoiceNumber}</h1>
            {voided ? (
              <Badge variant="secondary">Voided</Badge>
            ) : (
              <Badge variant={invoice.status === "Paid" ? "default" : "secondary"}>
                {invoice.status}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {invoice.client.name} · {formatDate(invoice.periodStart)} –{" "}
            {formatDate(invoice.periodEnd)}
          </p>
          {invoice.sentAt && (
            <p className="text-sm text-muted-foreground">Sent {formatDate(invoice.sentAt)}</p>
          )}
          {invoice.paidAt && (
            <p className="text-sm text-muted-foreground">Paid {formatDate(invoice.paidAt)}</p>
          )}
          {invoice.voidedAt && (
            <p className="text-sm text-muted-foreground">Voided {formatDate(invoice.voidedAt)}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {invoice.pdfUrl ? (
            <Button variant="outline" render={<a href={`/invoices/${invoice.id}/pdf`} />}>
              <Download className="mr-1 h-4 w-4" /> Download PDF
            </Button>
          ) : (
            <RetryPdfButton invoiceId={invoice.id} />
          )}

          {/* One step at a time: a draft is confirmed, an issued invoice is
              sent, a sent one is paid. Showing every transition at once is how
              an invoice gets marked sent before it was ever finalised. */}
          {!voided && isAdmin && invoice.status === "Draft" && (
            <ConfirmInvoiceButton invoiceId={invoice.id} />
          )}
          {!voided && isAdmin && invoice.status === "Invoiced" && (
            <SendInvoiceActions
              invoiceId={invoice.id}
              googleConfigured={isGoogleConfigured()}
              signatures={signatures}
            />
          )}
          {!voided && isAdmin && (invoice.status === "Sent" || invoice.status === "Invoiced") && (
            <MarkPaidButton invoiceId={invoice.id} />
          )}
          {!voided && isAdmin && (
            <VoidInvoiceDialog
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              clientName={invoice.client.name}
              totalAmount={Number(invoice.totalAmount)}
              timeEntryCount={invoice.timeEntries.length}
              recurringChargeCount={invoice.recurringCharges.length}
              reimbursableExpenseCount={invoice.reimbursableExpenses.length}
            />
          )}
        </div>
      </div>

      {/* A null pdfUrl means two opposite things. On a generated invoice
          rendering failed and needs retrying; on an imported one the original
          PDF is in Drive and nothing is wrong. Saying "rendering failed" to
          someone looking at a correctly imported invoice sends them hunting
          for a problem that isn't there. */}
      {!invoice.pdfUrl && !voided && (
        <Card className={invoice.importedFrom ? "p-4" : "border-destructive/50 p-4"}>
          <p className={`text-sm ${invoice.importedFrom ? "text-muted-foreground" : "text-destructive"}`}>
            {invoice.importedFrom
              ? "Imported from the master sheet — the original PDF is in Drive, so none was rendered here. Creating a Gmail draft will build one, or use Retry PDF to build it now."
              : "This invoice has no PDF — rendering failed after it was created. The line items below are correct; use Retry PDF to render it."}
          </p>
        </Card>
      )}

      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Bill to
        </p>
        <p className="mt-1 font-medium">{invoice.client.name}</p>
        <p className="text-sm">ATTN: Accounting Department</p>
        {addressLine && <p className="text-sm">{addressLine}</p>}
        {invoice.client.cityStateZip && (
          <p className="text-sm">{invoice.client.cityStateZip}</p>
        )}
        {invoice.client.phone && <p className="text-sm">{invoice.client.phone}</p>}
      </Card>

      {/* Shown on a voided invoice too: money that arrived, arrived, and the
          record of it has to stay reachable to reconcile against a bank
          statement. */}
      {isAdmin && (invoice.payments.length > 0 || !voided) && (
        <Card>
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Payments</h2>
          </div>
          <div className="p-4">
            <InvoicePayments
              invoiceId={invoice.id}
              total={Number(invoice.totalAmount)}
              received={settlement.received}
              balance={settlement.balance}
              state={settlement.state}
              canEdit={!voided}
              payments={invoice.payments.map((p) => ({
                id: p.id,
                amount: Number(p.amount),
                receivedAt: p.receivedAt.toISOString().slice(0, 10),
                method: p.method,
                methodOther: p.methodOther,
                reference: p.reference,
                notes: p.notes,
              }))}
            />
          </div>
        </Card>
      )}

      {!voided && isAdmin && (
        <Card>
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Dates</h2>
          </div>
          <div className="p-4">
            <InvoicePaymentDetails
              invoiceId={invoice.id}
              sentAt={invoice.sentAt ? invoice.sentAt.toISOString().slice(0, 10) : null}
              paidAt={invoice.paidAt ? invoice.paidAt.toISOString().slice(0, 10) : null}
              paymentMethod={invoice.paymentMethod}
            />
          </div>
        </Card>
      )}

      {invoice.timeEntries.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="font-medium">Time entries ({invoice.timeEntries.length})</h2>
            {/* Says plainly that these hours are spoken for. Without it the
                only way to know an entry can't be billed again is to go back
                to Time Entries and read its Billed badge there. */}
            <p className="text-xs text-muted-foreground">
              {voided
                ? "Released — these entries are available to invoice again."
                : `Marked as invoiced on ${invoice.invoiceNumber} — they won't appear in a future invoice unless this one is voided.`}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.timeEntries.map((entry) => {
                const rate =
                  (entry.serviceType.rateOverride
                    ? Number(entry.serviceType.rateOverride)
                    : null) ?? clientRate;
                const hours = Number(entry.durationHours);
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {formatDate(entry.date)}
                        <Badge variant={voided ? "outline" : "secondary"} className="shrink-0">
                          {voided ? "Released" : "Invoiced"}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{entry.description}</TableCell>
                    <TableCell>{entry.serviceType.code}</TableCell>
                    <TableCell className="text-right">{formatHours(hours)}</TableCell>
                    <TableCell className="text-right">
                      {rate === null ? "—" : formatCurrency(rate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {rate === null ? "—" : formatCurrency(Number((hours * rate).toFixed(2)))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {invoice.recurringCharges.length > 0 && (
        <Card>
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Recurring charges</h2>
            <p className="text-xs text-muted-foreground">
              Snapshotted at billing time — later edits to the charge don&apos;t change this
              invoice.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...monthly, ...annual].map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell className="font-medium">{charge.description}</TableCell>
                  <TableCell>
                    {charge.billingFrequency === "Annual" ? "Annual (January)" : "Monthly"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(charge.amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {invoice.reimbursableExpenses.length > 0 && (
        <Card>
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">
              Reimbursable expenses ({invoice.reimbursableExpenses.length})
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.reimbursableExpenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(expense.date)}</TableCell>
                  <TableCell className="max-w-md truncate">{expense.description}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(expense.amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {isAdmin && (
        <Card className="p-4">
          <InvoiceCustomItems
            invoiceId={invoice.id}
            editable={!voided}
            items={invoice.customItems.map((c) => ({
              id: c.id,
              date: c.date ? c.date.toISOString().slice(0, 10) : null,
              description: c.description,
              hours: c.hours === null ? null : Number(c.hours),
              rate: c.rate === null ? null : Number(c.rate),
              amount: Number(c.amount),
            }))}
          />
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-baseline justify-end gap-6">
          <span className="text-sm text-muted-foreground">
            {formatHours(Number(invoice.totalHours))} billable hours
          </span>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total due</p>
            <p className="text-2xl font-semibold">
              {formatCurrency(Number(invoice.totalAmount))}
            </p>
          </div>
        </div>
      </Card>

      <div>
        <Button variant="ghost" render={<Link href="/invoices" />}>
          ← Back to invoices
        </Button>
      </div>
    </div>
  );
}

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
import { ReimbursableExpenseDialog } from "@/components/app/reimbursable-expense-dialog";
import { DeleteReimbursableExpenseButton } from "@/components/app/delete-reimbursable-expense-button";
import { TimeEntriesTabs } from "@/components/app/time-entries-tabs";
import { TimeEntryFilters } from "@/components/app/time-entry-filters";
import { formatCurrency } from "@/lib/format";
import { isDateRangePreset, resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { Pencil, Receipt } from "lucide-react";

/**
 * Costs paid on a client's behalf and billed back: cable, shipping, hardware.
 *
 * Its own route rather than a value on the time-entry Type filter. These are
 * money out of pocket, not hours, and burying them behind a dropdown meant
 * nobody looked at them until invoicing.
 *
 * Columns follow the operations sheet this replaces (Date / Client /
 * Description / Amount / Invoice / Logged by) so the two can be read side by
 * side during cutover without translating between them.
 */
export default async function ReimbursableChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; range?: string; start?: string; end?: string }>;
}) {
  const params = await searchParams;
  const clientId = params.client ?? "all";
  const range: DateRangePreset = isDateRangePreset(params.range) ? params.range : "all";
  const start = params.start ?? "";
  const end = params.end ?? "";
  const dateRange = resolveDateRange(range, start, end);

  const {
    data: [expenses, clients],
  } = await requireOrgContext((tx) =>
    Promise.all([
      tx.reimbursableExpense.findMany({
        where: {
          ...(clientId !== "all" ? { clientId } : {}),
          ...(dateRange ? { date: dateRange } : {}),
        },
        orderBy: { date: "desc" },
        take: 200,
        include: {
          client: { select: { name: true } },
          loggedByUser: { select: { name: true } },
          invoice: { select: { invoiceNumber: true } },
        },
      }),
      tx.client.findMany({ where: { activeStatus: true }, orderBy: { name: "asc" } }),
    ]),
  );

  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name, shortName: c.shortName }));
  const unbilledTotal = expenses
    .filter((e) => !e.invoiceId)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reimbursable charges</h1>
        <p className="text-muted-foreground">
          Costs paid on a client&apos;s behalf, billed back on their next invoice.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimeEntriesTabs />
        <ReimbursableExpenseDialog
          clients={clientOptions}
          trigger={
            <Button>
              <Receipt className="mr-1 h-4 w-4" /> Log expense
            </Button>
          }
        />
      </div>

      <TimeEntryFilters
        basePath="/time-entries/reimbursable-charges"
        clientId={clientId}
        range={range}
        start={start}
        end={end}
        clients={clientOptions}
      />

      {unbilledTotal > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatCurrency(unbilledTotal)}</span>{" "}
          unbilled — this will be added to the next invoice for the clients concerned.
        </p>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Logged by</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                {/* Sliced from the ISO string, not formatted through a locale:
                    the column is date-only, and rendering it in a timezone
                    would shift it a day. */}
                <TableCell className="whitespace-nowrap">
                  {expense.date.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>{expense.client.name}</TableCell>
                <TableCell className="max-w-xs truncate" title={expense.description}>
                  {expense.description}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(expense.amount))}
                </TableCell>
                <TableCell>
                  {expense.invoice ? (
                    <Badge variant="secondary">{expense.invoice.invoiceNumber}</Badge>
                  ) : (
                    <Badge variant="outline">Unbilled</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {expense.loggedByUser?.name ?? "—"}
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  <ReimbursableExpenseDialog
                    expenseId={expense.id}
                    clients={clientOptions}
                    defaultValues={{
                      clientId: expense.clientId,
                      date: expense.date.toISOString().slice(0, 10),
                      description: expense.description,
                      amount: Number(expense.amount),
                    }}
                    trigger={
                      <Button variant="ghost" size="icon-sm">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <DeleteReimbursableExpenseButton
                    id={expense.id}
                    isBilled={expense.invoiceId !== null}
                  />
                </TableCell>
              </TableRow>
            ))}
            {expenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No reimbursable charges yet. Log one when you buy something for a client.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BusinessExpenseDialog } from "@/components/app/business-expense-dialog";
import { DeleteBusinessExpenseButton } from "@/components/app/delete-business-expense-button";
import { EXPENSE_FREQUENCY_LABELS } from "@/lib/validations/business-expense";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * What the business pays out.
 *
 * Admin-only: these figures decide the profitability report, and a
 * technician has no reason to write them. The database enforces that too --
 * see supabase/migrations/0009_payments_and_expenses.sql.
 */
export default async function ExpensesPage() {
  const { appUser, authUserId } = await requireOrgContext();
  if (appUser.role !== "admin") redirect("/dashboard?error=admin-only");

  const [expenses, clients] = await withRLS(authUserId, (tx) =>
    Promise.all([
      tx.businessExpense.findMany({
        include: { client: { select: { id: true, name: true } } },
        orderBy: [{ activeStatus: "desc" }, { amount: "desc" }],
      }),
      tx.client.findMany({
        where: { activeStatus: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]),
  );

  // What a month of the recurring costs comes to. One-offs are excluded --
  // they are not part of the monthly run rate, which is the number this
  // heading is answering.
  const monthlyRunRate = expenses
    .filter((e) => e.activeStatus)
    .reduce((s, e) => {
      if (e.frequency === "Monthly") return s + Number(e.amount);
      if (e.frequency === "Annual") return s + Number(e.amount) / 12;
      return s;
    }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">
            Recurring business costs. {formatCurrency(monthlyRunRate)} a month across{" "}
            {expenses.filter((e) => e.activeStatus).length} active cost
            {expenses.filter((e) => e.activeStatus).length === 1 ? "" : "s"}.
          </p>
        </div>
        <BusinessExpenseDialog
          clients={clients}
          trigger={
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Add a cost
            </Button>
          }
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cost</TableHead>
              <TableHead>Belongs to</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>How often</TableHead>
              <TableHead>Since</TableHead>
              <TableHead className="w-[6rem]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e.id} className={e.activeStatus ? undefined : "text-muted-foreground"}>
                <TableCell className="font-medium">
                  {e.name}
                  {e.vendor && <span className="ml-2 text-xs text-muted-foreground">{e.vendor}</span>}
                  {!e.activeStatus && (
                    <Badge variant="secondary" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {e.client ? (
                    <Link href={`/clients/${e.client.id}`} className="hover:underline">
                      {e.client.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Overhead</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.category ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(e.amount))}
                </TableCell>
                <TableCell>{EXPENSE_FREQUENCY_LABELS[e.frequency]}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {e.startDate ? formatDate(e.startDate) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <BusinessExpenseDialog
                      expenseId={e.id}
                      clients={clients}
                      defaultValues={{
                        name: e.name,
                        vendor: e.vendor,
                        category: e.category,
                        amount: Number(e.amount),
                        frequency: e.frequency,
                        clientId: e.clientId,
                        startDate: e.startDate ? e.startDate.toISOString().slice(0, 10) : null,
                        endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : null,
                        activeStatus: e.activeStatus,
                        notes: e.notes,
                      }}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Edit cost">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DeleteBusinessExpenseButton id={e.id} name={e.name} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {expenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No costs recorded yet. Add GoToCentral, the PSA, VoIP and the rest, and Reports
                  will show revenue against them.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div>
        <Button variant="ghost" render={<Link href="/settings" />}>
          ← Back to settings
        </Button>
      </div>
    </div>
  );
}

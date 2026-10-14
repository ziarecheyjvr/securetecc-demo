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
import { RecurringChargeDialog } from "@/components/app/recurring-charge-dialog";
import { DeleteRecurringChargeButton } from "@/components/app/delete-recurring-charge-button";
import { TimeEntriesTabs } from "@/components/app/time-entries-tabs";
import { ADDON_ITEM_TYPE_LABELS } from "@/lib/validations/recurring-charge";
import { formatCurrency } from "@/lib/format";
import { recurringRank } from "@/lib/recurring-order";
import { ListSearch } from "@/components/app/list-search";
import { Plus, Pencil } from "lucide-react";

/**
 * Cross-client view of every recurring charge ("monthly/yearly charges") in
 * the org -- the per-client version lives on each client's own "Recurring
 * charges" tab (src/app/(app)/clients/[id]/page.tsx); this one adds a Client
 * column and lets "New charge" pick which client it's for.
 */
export default async function RecurringChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const search = ((await searchParams).q ?? "").trim();
  const {
    data: [charges, clients, pricingRows],
  } = await requireOrgContext((tx, appUser) =>
    Promise.all([
      tx.recurringCharge.findMany({
        where: search
          ? {
              OR: [
                { description: { contains: search, mode: "insensitive" as const } },
                { reference: { contains: search, mode: "insensitive" as const } },
                { notes: { contains: search, mode: "insensitive" as const } },
                { authorizedBy: { contains: search, mode: "insensitive" as const } },
                { client: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {},
        include: { client: true },
        // Client, then the service ranking within each -- site fee, RMM,
        // email security, the rest. Applied in code because no column sorts
        // by what a service IS; see lib/recurring-order.ts.
        orderBy: [{ client: { name: "asc" } }],
      }),
      tx.client.findMany({ where: { activeStatus: true }, orderBy: { name: "asc" } }),
      tx.addonPricing.findMany({ where: { organizationId: appUser.organizationId } }),
    ]),
  );

  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));
  const addonPricing = Object.fromEntries(
    pricingRows.map((p) => [p.itemType, Number(p.defaultRate)]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Time entries</h1>
        <p className="text-muted-foreground">Logged time, expenses, and recurring charges.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimeEntriesTabs />
        <Suspense fallback={null}>
          <ListSearch
            initial={search}
            label="Search recurring charges"
            placeholder="Search service, client, reference, notes…"
          />
        </Suspense>
        <RecurringChargeDialog
          clients={clientOptions}
          addonPricing={addonPricing}
          trigger={
            <Button>
              <Plus className="mr-1 h-4 w-4" /> New charge
            </Button>
          }
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Pulled into invoices automatically. Annual charges only apply to a January period.
      </p>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {/* Column set mirrors the Operations Master Sheet's
                  RECURRING_CHARGES tab, so a row can be reconciled against the
                  spreadsheet without translating between two schemes. */}
              <TableHead>Charge ID</TableHead>
              <TableHead>Client ID</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="text-right">Qty × Unit</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortWithinClients(charges).map((charge) => (
              <TableRow key={charge.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {charge.reference ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {charge.client.reference ?? "—"}
                </TableCell>
                <TableCell>{charge.client.name}</TableCell>
                <TableCell className="font-medium">{charge.description}</TableCell>
                <TableCell className="text-muted-foreground">
                  {charge.itemType ? ADDON_ITEM_TYPE_LABELS[charge.itemType] : "—"}
                </TableCell>
                <TableCell>
                  Recurring · {charge.billingFrequency === "Annual" ? "Annual (January)" : "Monthly"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {charge.quantity !== null && charge.unitPrice !== null
                    ? `${charge.quantity} × ${formatCurrency(Number(charge.unitPrice))}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(Number(charge.amount))}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {charge.startDate
                    ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(charge.startDate)
                    : "—"}
                </TableCell>
                <TableCell className="max-w-[16rem] text-xs text-muted-foreground">
                  {charge.notes ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={charge.activeStatus ? "default" : "secondary"}>
                    {charge.activeStatus ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <RecurringChargeDialog
                      clientId={charge.clientId}
                      recurringChargeId={charge.id}
                      addonPricing={addonPricing}
                      defaultValues={{
                        description: charge.description,
                        amount: Number(charge.amount),
                        billingFrequency: charge.billingFrequency,
                        activeStatus: charge.activeStatus,
                        itemType: charge.itemType,
                        authorizedBy: charge.authorizedBy ?? "",
                        notes: charge.notes ?? "",
                      }}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Edit charge">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DeleteRecurringChargeButton id={charge.id} clientId={charge.clientId} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {charges.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">
                  No recurring charges yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/** Keeps the client grouping from the query, ranking services inside it. */
function sortWithinClients<
  T extends { client: { name: string }; itemType: Parameters<typeof recurringRank>[0]["itemType"]; description: string },
>(charges: T[]): T[] {
  return [...charges].sort(
    (a, b) =>
      a.client.name.localeCompare(b.client.name) ||
      recurringRank(a) - recurringRank(b) ||
      a.description.localeCompare(b.description),
  );
}

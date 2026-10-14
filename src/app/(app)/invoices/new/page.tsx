import { requireOrgContext } from "@/lib/auth";
import { InvoiceGenerationFlow } from "@/components/app/invoice-generation-flow";

export default async function NewInvoicePage() {
  const { data: clients } = await requireOrgContext((tx) =>
    tx.client.findMany({
      // SecureTECC's own work is never invoiced.
      where: { activeStatus: true, isInternal: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generate invoice</h1>
        <p className="text-muted-foreground">
          Pick a client and billing period, review what will be billed, then create a draft.
        </p>
      </div>
      <InvoiceGenerationFlow clients={clients} />
    </div>
  );
}

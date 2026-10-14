import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/auth";
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
import { ServiceTypeDialog } from "@/components/app/service-type-dialog";
import { DeleteServiceTypeButton } from "@/components/app/delete-service-type-button";
import { Plus, Pencil } from "lucide-react";

export default async function ServiceTypesPage() {
  const { appUser, data: serviceTypes } = await requireOrgContext((tx) =>
    tx.serviceType.findMany({ orderBy: { code: "asc" } }),
  );
  if (appUser.role !== "admin") redirect("/dashboard?error=admin-only");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service types</h1>
          <p className="text-muted-foreground">
            Billing minimums and rate overrides used for time entries and the AI parser.
          </p>
        </div>
        <ServiceTypeDialog
          trigger={
            <Button>
              <Plus className="mr-1 h-4 w-4" /> New service type
            </Button>
          }
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Billing minimum</TableHead>
              <TableHead>Rate override</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {serviceTypes.map((st) => (
              <TableRow key={st.id}>
                <TableCell className="font-mono font-medium">{st.code}</TableCell>
                <TableCell>{st.label}</TableCell>
                <TableCell>{st.billingMinimumHours.toString()} hr</TableCell>
                <TableCell>
                  {st.rateOverride ? `$${st.rateOverride.toString()}/hr` : "Client's standard rate"}
                  {st.scheduledRate && st.scheduledRateFrom && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      → ${st.scheduledRate.toString()}/hr from{" "}
                      {st.scheduledRateFrom.toISOString().slice(0, 10)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  <ServiceTypeDialog
                    serviceTypeId={st.id}
                    defaultValues={{
                      code: st.code,
                      label: st.label,
                      billingMinimumHours: Number(st.billingMinimumHours),
                      rateOverride: st.rateOverride ? Number(st.rateOverride) : undefined,
                      scheduledRate: st.scheduledRate ? Number(st.scheduledRate) : undefined,
                      scheduledRateFrom: st.scheduledRateFrom
                        ? st.scheduledRateFrom.toISOString().slice(0, 10)
                        : null,
                    }}
                    trigger={
                      <Button variant="ghost" size="icon-sm">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <DeleteServiceTypeButton id={st.id} code={st.code} />
                </TableCell>
              </TableRow>
            ))}
            {serviceTypes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No service types yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

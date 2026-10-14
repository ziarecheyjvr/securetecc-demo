"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { clientFormSchema, type ClientFormValues } from "@/lib/validations/client";
import { SERVICE_AREA_LABELS } from "@/lib/billing/travel";
import { LEAD_SOURCE_LABELS } from "@/lib/lead-source";
import { createClientRecord, updateClientRecord } from "@/app/(app)/clients/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

export function ClientForm({
  clientId,
  defaultValues,
}: {
  clientId?: string;
  defaultValues?: Partial<ClientFormValues>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: "",
      shortName: "",
      ownerName: "",
      billingContactName: "",
      email: "",
      phone: "",
      address1: "",
      address2: "",
      cityStateZip: "",
      billingType: "Hourly",
      billingCadence: "Monthly",
      billingRate: undefined,
      scheduledRate: undefined,
      scheduledRateFrom: null,
      serviceArea: "InArea",
      leadSource: null,
      leadSourceNote: null,
      relationshipStartedOn: null,
      activeStatus: true,
      isInternal: false,
      notes: "",
      ...defaultValues,
    },
  });

  async function onSubmit(values: ClientFormValues) {
    setSubmitting(true);
    const result = clientId
      ? await updateClientRecord(clientId, values)
      : await createClientRecord(values);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(clientId ? "Client updated" : "Client created");
    router.push("/clients");
    router.refresh();
  }

  const billingType = watch("billingType");
  const billingCadence = watch("billingCadence");
  const serviceArea = watch("serviceArea");
  const leadSource = watch("leadSource");
  const activeStatus = watch("activeStatus");
  const isInternal = watch("isInternal");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="shortName">Short name</Label>
            <Input id="shortName" placeholder="e.g. ACME" {...register("shortName")} />
            {errors.shortName && (
              <p className="text-xs text-destructive">{errors.shortName.message}</p>
            )}
            <p className="text-xs text-muted-foreground">Used in invoice numbers (ACME-00001).</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ownerName">Owner name</Label>
            <Input id="ownerName" {...register("ownerName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingContactName">Billing contact name</Label>
            <Input id="billingContactName" {...register("billingContactName")} />
            <p className="text-xs text-muted-foreground">
              Who invoices are addressed to, if that isn&apos;t the owner.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Billing email</Label>
            <Input id="email" type="email" {...register("email")} />
            {/* Named plainly: this is the address the invoice actually goes to
                when a Gmail draft is created, not a general contact address. */}
            <p className="text-xs text-muted-foreground">Where invoices are sent.</p>
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...register("phone")} />
          </div>
          <div />
          <div className="space-y-2">
            <Label htmlFor="address1">Address line 1</Label>
            <Input id="address1" {...register("address1")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address2">Address line 2</Label>
            <Input id="address2" {...register("address2")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cityStateZip">City, State ZIP</Label>
            <Input id="cityStateZip" {...register("cityStateZip")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="billingType">Billing type</Label>
            <Select
              value={billingType}
              onValueChange={(v) => setValue("billingType", v as ClientFormValues["billingType"])}
            >
              <SelectTrigger id="billingType">
                <SelectValue>
                  {(value) => (value === "Retainer" ? "Retainer" : "Hourly")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Hourly">Hourly</SelectItem>
                <SelectItem value="Retainer">Retainer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingCadence">Billing cycle</Label>
            <Select
              value={billingCadence}
              onValueChange={(v) => setValue("billingCadence", v as ClientFormValues["billingCadence"])}
            >
              <SelectTrigger id="billingCadence">
                <SelectValue>{(value) => (value === "Quarterly" ? "Quarterly" : "Monthly")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How often this client should be invoiced. The dashboard flags anyone carrying unbilled
              work for longer than this.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingRate">Billing rate ($/hr)</Label>
            <Input
              id="billingRate"
              type="number"
              step="0.01"
              {...register("billingRate", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduledRate">Next rate ($/hr)</Label>
            <Input
              id="scheduledRate"
              type="number"
              step="0.01"
              placeholder="—"
              {...register("scheduledRate", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              A rate already agreed for later — it takes over by itself on the date beside it,
              and work dated before that still bills at the current rate.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduledRateFrom">From</Label>
            <Input
              id="scheduledRateFrom"
              type="date"
              {...register("scheduledRateFrom", { setValueAs: (v) => (v === "" ? null : v) })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceArea">Service area</Label>
            <Select
              value={serviceArea}
              onValueChange={(v) => setValue("serviceArea", v as ClientFormValues["serviceArea"])}
            >
              <SelectTrigger id="serviceArea">
                <SelectValue>
                  {(value) => SERVICE_AREA_LABELS[value as ClientFormValues["serviceArea"]]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="InArea">{SERVICE_AREA_LABELS.InArea}</SelectItem>
                <SelectItem value="OutOfArea">{SERVICE_AREA_LABELS.OutOfArea}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              In area: one-hour on-site minimum, travel billed one way. Outside: two hours, and
              travel both ways.
            </p>
          </div>

          {/* Intake attribution, answered when the client arrives -- after the
              fact nobody remembers where they came from. */}
          <div className="space-y-2">
            <Label htmlFor="leadSource">How did you hear about us?</Label>
            <Select
              value={leadSource ?? "unrecorded"}
              onValueChange={(v) =>
                setValue(
                  "leadSource",
                  v === "unrecorded" ? null : (v as ClientFormValues["leadSource"]),
                )
              }
            >
              <SelectTrigger id="leadSource">
                <SelectValue placeholder="Not recorded">
                  {(value) =>
                    value === "unrecorded" || !value
                      ? "Not recorded"
                      : LEAD_SOURCE_LABELS[value as NonNullable<ClientFormValues["leadSource"]>]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unrecorded">Not recorded</SelectItem>
                {Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Answered at intake, so it is known which channels bring clients in.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="relationshipStartedOn">Relationship started</Label>
            <Input
              id="relationshipStartedOn"
              type="date"
              {...register("relationshipStartedOn", { setValueAs: (v) => (v === "" ? null : v) })}
            />
            <p className="text-xs text-muted-foreground">
              The day the client relationship began.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="leadSourceNote">Attribution detail</Label>
            <Input
              id="leadSourceNote"
              placeholder="Which campaign, or who referred them"
              {...register("leadSourceNote", { setValueAs: (v) => (v === "" ? null : v) })}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="activeStatus">Status</Label>
            <Select
              value={activeStatus ? "active" : "inactive"}
              onValueChange={(v) => setValue("activeStatus", v === "active")}
            >
              <SelectTrigger id="activeStatus">
                <SelectValue>
                  {(value) => (value === "active" ? "Active" : "Inactive")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={isInternal}
              onChange={(e) => setValue("isInternal", e.target.checked)}
            />
            <span>
              SecureTECC internal work
              <span className="block text-xs text-muted-foreground">
                For SecureTECC&apos;s own and shared jobs. Time logged here is always non-billable and
                the client is left out of invoicing and revenue reports.
              </span>
            </span>
          </label>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} {...register("notes")} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/clients")}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : clientId ? "Save changes" : "Create client"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  serviceTypeFormSchema,
  type ServiceTypeFormValues,
} from "@/lib/validations/service-type";
import { createServiceType, updateServiceType } from "@/app/(app)/settings/service-types/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ServiceTypeDialog({
  serviceTypeId,
  defaultValues,
  trigger,
}: {
  serviceTypeId?: string;
  defaultValues?: Partial<ServiceTypeFormValues>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServiceTypeFormValues>({
    resolver: zodResolver(serviceTypeFormSchema),
    defaultValues: {
      code: "",
      label: "",
      billingMinimumHours: 0.25,
      rateOverride: undefined,
      scheduledRate: undefined,
      scheduledRateFrom: null,
      ...defaultValues,
    },
  });

  async function onSubmit(values: ServiceTypeFormValues) {
    setSubmitting(true);
    const result = serviceTypeId
      ? await updateServiceType(serviceTypeId, values)
      : await createServiceType(values);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(serviceTypeId ? "Service type updated" : "Service type created");
    setOpen(false);
    if (!serviceTypeId) reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{serviceTypeId ? "Edit service type" : "New service type"}</DialogTitle>
            <DialogDescription>
              Used to tag time entries and set billing minimums. The code is what the AI parser
              matches against, so keep it short and stable.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" placeholder="R-S" {...register("code")} />
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="label">Label</Label>
                <Input id="label" placeholder="Remote Service" {...register("label")} />
                {errors.label && (
                  <p className="text-xs text-destructive">{errors.label.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="billingMinimumHours">Billing minimum (hrs)</Label>
                <Input
                  id="billingMinimumHours"
                  type="number"
                  step="0.25"
                  {...register("billingMinimumHours", { valueAsNumber: true })}
                />
                {errors.billingMinimumHours && (
                  <p className="text-xs text-destructive">{errors.billingMinimumHours.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateOverride">Rate override ($/hr)</Label>
                <Input
                  id="rateOverride"
                  type="number"
                  step="0.01"
                  placeholder="Uses client's standard rate"
                  {...register("rateOverride", { valueAsNumber: true })}
                />
              </div>
            </div>

            {/* A rate agreed for later. Both together or neither -- a figure
                with no date never takes effect, and a date with no figure
                changes nothing. */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledRate">Next rate ($/hr)</Label>
                <Input
                  id="scheduledRate"
                  type="number"
                  step="0.01"
                  placeholder="No change planned"
                  {...register("scheduledRate", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledRateFrom">From</Label>
                <Input
                  id="scheduledRateFrom"
                  type="date"
                  {...register("scheduledRateFrom", { setValueAs: (v) => (v === "" ? null : v) })}
                />
                <p className="text-xs text-muted-foreground">
                  Takes over by itself. Work dated before it still bills at the current rate.
                </p>
              </div>
            </div>

          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

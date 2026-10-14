"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ADDON_ITEM_TYPE_LABELS,
  ADDON_ITEM_TYPES,
  recurringChargeFormSchema,
  type RecurringChargeFormValues,
} from "@/lib/validations/recurring-charge";
import {
  createRecurringCharge,
  updateRecurringCharge,
} from "@/app/(app)/clients/recurring-charge-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const FREQUENCY_LABELS: Record<string, string> = {
  Monthly: "Monthly",
  Annual: "Annual (January)",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active — include on new invoices",
  inactive: "Inactive — stop billing",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  none: "— None —",
  ...ADDON_ITEM_TYPE_LABELS,
};

type ClientOption = { id: string; name: string };

export function RecurringChargeDialog({
  clientId,
  clients,
  recurringChargeId,
  defaultValues,
  /** itemType -> default amount, for the pre-fill-on-select behavior below. Reference-only. */
  addonPricing = {},
  trigger,
}: {
  /**
   * Pre-set client (the per-client "Recurring charges" tab, and every edit --
   * a charge never changes client). When omitted, a client picker renders
   * instead (the cross-client /time-entries/recurring-charges "New charge"
   * flow) and `clients` becomes required.
   */
  clientId?: string;
  clients?: ClientOption[];
  recurringChargeId?: string;
  defaultValues?: Partial<RecurringChargeFormValues>;
  addonPricing?: Partial<Record<(typeof ADDON_ITEM_TYPES)[number], number>>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pickedClientId, setPickedClientId] = useState("");
  const effectiveClientId = clientId ?? pickedClientId;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<RecurringChargeFormValues>({
    resolver: zodResolver(recurringChargeFormSchema),
    defaultValues: {
      description: "",
      amount: 0,
      billingFrequency: "Monthly",
      activeStatus: true,
      itemType: null,
      quantity: null,
      unitPrice: null,
      cost: null,
      startDate: null,
      authorizedBy: "",
      notes: "",
      ...defaultValues,
    },
  });

  /**
   * Quantity x unit price fills in the amount.
   *
   * On blur rather than on every keystroke, and it never overwrites a figure
   * that disagrees deliberately: amount is what actually gets billed, and a
   * negotiated total has to be able to differ from the arithmetic.
   */
  function syncAmountFromUnits() {
    const q = getValues("quantity");
    const u = getValues("unitPrice");
    if (q === null || u === null || Number.isNaN(q) || Number.isNaN(u)) return;
    const current = getValues("amount");
    if (current === 0 || Number.isNaN(current)) {
      setValue("amount", Number((q * u).toFixed(2)));
    }
  }

  const billingFrequency = watch("billingFrequency");
  const activeStatus = watch("activeStatus");
  const itemType = watch("itemType");
  const amount = watch("amount");

  async function onSubmit(values: RecurringChargeFormValues) {
    if (!effectiveClientId) {
      toast.error("Select a client first.");
      return;
    }
    setSubmitting(true);
    const result = recurringChargeId
      ? await updateRecurringCharge(recurringChargeId, effectiveClientId, values)
      : await createRecurringCharge(effectiveClientId, values);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(recurringChargeId ? "Recurring charge updated" : "Recurring charge added");
    setOpen(false);
    if (!recurringChargeId) {
      reset();
      setPickedClientId("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {recurringChargeId ? "Edit recurring charge" : "New recurring charge"}
            </DialogTitle>
            <DialogDescription>
              Billed every period this client is invoiced. Monthly charges apply to every invoice;
              Annual charges are only pulled in for a January billing period.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {!clientId && (
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={pickedClientId} onValueChange={(v) => setPickedClientId(v ?? "")}>
                  <SelectTrigger>
                    {/* base-ui renders the raw value (a uuid) without this mapper */}
                    <SelectValue placeholder="Select client">
                      {(value) => clients?.find((c) => c.id === value)?.name ?? "Select client"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Managed Antivirus — 24 endpoints"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="itemType">Item type</Label>
              <Select
                value={itemType ?? "none"}
                onValueChange={(v) => {
                  const next = v === "none" ? null : ((v ?? "none") as RecurringChargeFormValues["itemType"]);
                  setValue("itemType", next);
                  // Pre-fill the amount only when it's still at the untouched
                  // default -- never clobber a value someone already typed.
                  const defaultRate = next ? addonPricing[next] : undefined;
                  if (defaultRate !== undefined && (amount === 0 || Number.isNaN(amount))) {
                    setValue("amount", defaultRate);
                  }
                }}
              >
                <SelectTrigger id="itemType">
                  <SelectValue>{(value) => ITEM_TYPE_LABELS[(value as string) ?? "none"]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Reference only -- classifies the charge and suggests an amount below; never
                affects billing.
              </p>
            </div>

            {/* Seats x unit price. Optional, because a site fee is one thing
                rather than "1 of something" -- but when a client adds a seat,
                the count is what changed, and a total with no count behind it
                cannot show that. */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="—"
                  {...register("quantity", {
                    setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
                  })}
                  onBlur={syncAmountFromUnits}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitPrice">Unit price ($)</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  placeholder="—"
                  {...register("unitPrice", {
                    setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
                  })}
                  onBlur={syncAmountFromUnits}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">Started</Label>
                <Input
                  id="startDate"
                  type="date"
                  {...register("startDate", { setValueAs: (v) => (v === "" ? null : v) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  {...register("amount", { valueAsNumber: true })}
                />
                {errors.amount && (
                  <p className="text-xs text-destructive">{errors.amount.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cost">Cost to us ($)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  placeholder="Nothing"
                  {...register("cost", {
                    setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  What delivering this costs per period. The margin is the difference.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="billingFrequency">Frequency</Label>
                <Select
                  value={billingFrequency}
                  onValueChange={(v) =>
                    setValue("billingFrequency", (v ?? "Monthly") as "Monthly" | "Annual")
                  }
                >
                  <SelectTrigger id="billingFrequency">
                    {/* base-ui renders the raw value unless given this mapper */}
                    <SelectValue>{(value) => FREQUENCY_LABELS[value as string]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="authorizedBy">Authorized by</Label>
              <Input
                id="authorizedBy"
                placeholder="e.g. Jordan Lee"
                {...register("authorizedBy")}
              />
              <p className="text-xs text-muted-foreground">
                Recorded on this charge&apos;s audit history -- who approved it.
              </p>
              {errors.authorizedBy && (
                <p className="text-xs text-destructive">{errors.authorizedBy.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder="e.g. 18 devices x $25 — verify count monthly"
                {...register("notes")}
              />
              <p className="text-xs text-muted-foreground">
                Internal only — never appears on an invoice.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activeStatus">Status</Label>
              <Select
                value={activeStatus ? "active" : "inactive"}
                onValueChange={(v) => setValue("activeStatus", (v ?? "active") === "active")}
              >
                <SelectTrigger id="activeStatus">
                  <SelectValue>{(value) => STATUS_LABELS[value as string]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

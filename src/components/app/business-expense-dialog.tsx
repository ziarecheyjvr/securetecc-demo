"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  businessExpenseFormSchema,
  EXPENSE_FREQUENCIES,
  EXPENSE_FREQUENCY_LABELS,
  type BusinessExpenseFormValues,
} from "@/lib/validations/business-expense";
import {
  createBusinessExpense,
  updateBusinessExpense,
} from "@/app/(app)/settings/expenses/actions";
import { EXPENSE_CATEGORIES } from "@/lib/billing/expense-categories";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ClientOption = { id: string; name: string };

const OVERHEAD = "overhead";

/** A recurring business cost: GoToCentral, the PSA, VoIP, an email service. */
export function BusinessExpenseDialog({
  expenseId,
  defaultValues,
  clients,
  trigger,
}: {
  expenseId?: string;
  defaultValues?: Partial<BusinessExpenseFormValues>;
  clients: ClientOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BusinessExpenseFormValues>({
    resolver: zodResolver(businessExpenseFormSchema),
    defaultValues: {
      name: "",
      vendor: null,
      category: null,
      amount: 0,
      frequency: "Monthly",
      clientId: null,
      startDate: null,
      endDate: null,
      activeStatus: true,
      notes: null,
      ...defaultValues,
    },
  });

  async function onSubmit(values: BusinessExpenseFormValues) {
    setSubmitting(true);
    const result = expenseId
      ? await updateBusinessExpense(expenseId, values)
      : await createBusinessExpense(values);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(expenseId ? "Cost updated" : "Cost added");
    setOpen(false);
    if (!expenseId) reset();
    router.refresh();
  }

  const frequency = watch("frequency");
  const category = watch("category");
  const clientId = watch("clientId");
  const activeStatus = watch("activeStatus");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{expenseId ? "Edit cost" : "Add a cost"}</DialogTitle>
            <DialogDescription>
              What the business pays out. Attach it to a client to set it against what that
              client is billed; leave it unattached and it counts as overhead.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">What is it</Label>
              <Input id="name" placeholder="GoToCentral" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vendor">Vendor</Label>
                <Input
                  id="vendor"
                  placeholder="—"
                  {...register("vendor", { setValueAs: (v) => (v === "" ? null : v) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={category ?? ""}
                  onValueChange={(v) => setValue("category", v ? String(v) : null)}
                >
                  <SelectTrigger id="category">
                    <SelectValue>{(value) => (value ? String(value) : "Choose a category")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                    {/* An older free-text category stays selectable so editing
                        the expense doesn't silently change it. */}
                    {category && !(EXPENSE_CATEGORIES as readonly string[]).includes(category) && (
                      <SelectItem value={category}>{category} (reported as Other)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                <Label>How often</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) =>
                    setValue("frequency", (v ?? "Monthly") as BusinessExpenseFormValues["frequency"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(value) =>
                        EXPENSE_FREQUENCY_LABELS[
                          value as BusinessExpenseFormValues["frequency"]
                        ] ?? "Monthly"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {EXPENSE_FREQUENCY_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  An annual cost is spread evenly across the months it covers.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Belongs to</Label>
              <Select
                value={clientId ?? OVERHEAD}
                onValueChange={(v) => setValue("clientId", v === OVERHEAD ? null : (v ?? null))}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value === OVERHEAD || !value
                        ? "Overhead — not one client"
                        : (clients.find((c) => c.id === value)?.name ?? "Overhead — not one client")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OVERHEAD}>Overhead — not one client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="startDate">Started</Label>
                <Input
                  id="startDate"
                  type="date"
                  {...register("startDate", { setValueAs: (v) => (v === "" ? null : v) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Ended</Label>
                <Input
                  id="endDate"
                  type="date"
                  {...register("endDate", { setValueAs: (v) => (v === "" ? null : v) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={activeStatus ? "active" : "inactive"}
                  onValueChange={(v) => setValue("activeStatus", v === "active")}
                >
                  <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                {...register("notes", { setValueAs: (v) => (v === "" ? null : v) })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

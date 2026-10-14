"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  reimbursableExpenseFormSchema,
  type ReimbursableExpenseFormValues,
} from "@/lib/validations/reimbursable-expense";
import {
  createReimbursableExpense,
  updateReimbursableExpense,
} from "@/app/(app)/reimbursable-expenses/actions";
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

/** Mirrors TimeEntryDialog's shape, minus service-type/hours, plus amount. */
export function ReimbursableExpenseDialog({
  expenseId,
  defaultValues,
  clients,
  trigger,
}: {
  expenseId?: string;
  defaultValues?: Partial<ReimbursableExpenseFormValues>;
  clients: ClientOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ReimbursableExpenseFormValues>({
    resolver: zodResolver(reimbursableExpenseFormSchema),
    defaultValues: {
      clientId: "",
      date: new Date().toISOString().slice(0, 10),
      description: "",
      amount: 0,
      ...defaultValues,
    },
  });

  async function onSubmit(values: ReimbursableExpenseFormValues) {
    setSubmitting(true);
    const result = expenseId
      ? await updateReimbursableExpense(expenseId, values)
      : await createReimbursableExpense(values);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(expenseId ? "Expense updated" : "Expense logged");
    setOpen(false);
    if (!expenseId) reset();
  }

  const clientId = watch("clientId");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{expenseId ? "Edit expense" : "Log expense"}</DialogTitle>
            <DialogDescription>
              A one-off billable material or expense cost, separate from logged time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={(v) => setValue("clientId", v ?? "")}>
                  <SelectTrigger>
                    {/* base-ui renders the raw value (a uuid) without this mapper */}
                    <SelectValue placeholder="Select client">
                      {(value) => clients.find((c) => c.id === value)?.name ?? "Select client"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.clientId && (
                  <p className="text-xs text-destructive">{errors.clientId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" {...register("date")} />
              </div>
            </div>

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
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={3} {...register("description")} />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
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

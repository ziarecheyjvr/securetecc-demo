"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import {
  addInvoiceCustomItem,
  deleteInvoiceCustomItem,
  updateInvoiceCustomItem,
} from "@/app/(app)/invoices/custom-item-actions";
import { formatCurrency } from "@/lib/format";

export type CustomItem = {
  id: string;
  date: string | null;
  description: string;
  hours: number | null;
  rate: number | null;
  amount: number;
};

/**
 * Hand-added invoice lines, editable after generation.
 *
 * Time entries, expenses and recurring charges are derived and shouldn't be
 * rewritten from here -- they're shared with reporting and, in the case of
 * time entries, with whichever other invoice might pick them up. Anything the
 * generator can't express (a one-off adjustment, a credit, work agreed
 * verbally) goes here instead.
 */
export function InvoiceCustomItems({
  invoiceId,
  items,
  editable,
}: {
  invoiceId: string;
  items: CustomItem[];
  /** False on a voided invoice -- see assertEditable in the action. */
  editable: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Additional items</h2>
          <p className="text-sm text-muted-foreground">
            Adjustments, credits and anything not captured by a time entry or charge.
          </p>
        </div>
        {editable && <ItemDialog invoiceId={invoiceId} />}
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          No additional items.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground">
                {item.date ? formatDay(item.date) : "—"}
              </span>
              <span className="min-w-0 flex-1">{item.description}</span>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {item.hours ?? ""}
              </span>
              <span
                className={`w-24 shrink-0 text-right tabular-nums ${
                  item.amount < 0 ? "text-destructive" : ""
                }`}
              >
                {formatCurrency(item.amount)}
              </span>
              {editable && (
                <span className="flex shrink-0 gap-1">
                  <ItemDialog invoiceId={invoiceId} item={item} />
                  <DeleteButton invoiceId={invoiceId} id={item.id} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemDialog({ invoiceId, item }: { invoiceId: string; item?: CustomItem }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    date: item?.date ?? "",
    description: item?.description ?? "",
    hours: item?.hours?.toString() ?? "",
    rate: item?.rate?.toString() ?? "",
    amount: item?.amount?.toString() ?? "",
  });

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function submit() {
    setPending(true);
    const values = {
      date: form.date,
      description: form.description,
      hours: num(form.hours),
      rate: num(form.rate),
      amount: Number(form.amount),
    };
    const result = item
      ? await updateInvoiceCustomItem(item.id, invoiceId, values)
      : await addInvoiceCustomItem(invoiceId, values);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(item ? "Item updated" : "Item added");
    setOpen(false);
    if (!item) setForm({ date: "", description: "", hours: "", rate: "", amount: "" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          item ? (
            <Button variant="ghost" size="icon" aria-label="Edit item">
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add item
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add item"}</DialogTitle>
          <DialogDescription>
            Leave hours and rate blank for a flat amount. A negative amount records a credit
            or discount.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ci-description">Description</Label>
            <Input
              id="ci-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Goodwill credit — extended outage"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ci-date">Date (optional)</Label>
              <Input
                id="ci-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-amount">Amount</Label>
              <Input
                id="ci-amount"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-hours">Hours (optional)</Label>
              <Input
                id="ci-hours"
                type="number"
                step="0.25"
                value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-rate">Rate (optional)</Label>
              <Input
                id="ci-rate"
                type="number"
                step="0.01"
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={pending || !form.description.trim() || form.amount.trim() === ""}
          >
            {pending ? "Saving…" : item ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ invoiceId, id }: { invoiceId: string; id: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Remove item"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await deleteInvoiceCustomItem(id, invoiceId);
        setPending(false);
        if (result.ok) toast.success("Item removed");
        else toast.error(result.error);
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHODS, type PaymentMethodValue } from "@/lib/payment-methods";
import { methodLabel, SETTLEMENT_LABELS, type SettlementState } from "@/lib/billing/payments";
import { deletePayment, recordPayment } from "@/app/(app)/invoices/payment-actions";
import { formatCurrency, formatDate } from "@/lib/format";

export type PaymentRow = {
  id: string;
  amount: number;
  receivedAt: string;
  method: PaymentMethodValue;
  methodOther: string | null;
  reference: string | null;
  notes: string | null;
};

/**
 * Payments against one invoice.
 *
 * A list, not a paid/unpaid switch: $2,000 invoiced with $1,000 received by
 * ACH is two facts and a balance, and a single flag says none of them. The
 * invoice's own status is recomputed from these rows on every write, so it
 * cannot drift from what was actually received.
 */
export function InvoicePayments({
  invoiceId,
  total,
  payments,
  received,
  balance,
  state,
  canEdit,
}: {
  invoiceId: string;
  total: number;
  payments: PaymentRow[];
  received: number;
  balance: number;
  state: SettlementState;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    // Pre-filled with what is still owed: paying the balance is the common
    // case, and typing it again invites a typo.
    amount: balance > 0 ? String(balance) : "",
    receivedAt: today,
    method: "Check" as PaymentMethodValue,
    methodOther: "",
    reference: "",
  });

  async function save() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    const result = await recordPayment(invoiceId, {
      amount,
      receivedAt: form.receivedAt,
      method: form.method,
      methodOther: form.method === "Other" ? form.methodOther.trim() || null : null,
      reference: form.reference.trim() || null,
      notes: null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Payment recorded");
    setAdding(false);
    setForm({ amount: "", receivedAt: today, method: "Check", methodOther: "", reference: "" });
    router.refresh();
  }

  async function remove(id: string, amount: number) {
    if (!confirm(`Delete the ${formatCurrency(amount)} payment? This changes the invoice status.`))
      return;
    setBusyId(id);
    const result = await deletePayment(id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Payment deleted");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Invoiced" value={formatCurrency(total)} />
        <Figure label="Received" value={formatCurrency(received)} />
        <Figure
          label={SETTLEMENT_LABELS[state]}
          value={formatCurrency(balance)}
          hint={balance > 0 ? "still owed" : "nothing outstanding"}
          emphasis={balance > 0}
        />
      </div>

      {payments.length > 0 && (
        <ul className="divide-y rounded-md border">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 tabular-nums font-medium">
                {formatCurrency(p.amount)}
              </span>
              <span className="w-24 shrink-0 whitespace-nowrap text-muted-foreground">
                {formatDate(p.receivedAt)}
              </span>
              <span className="shrink-0">{methodLabel(p.method, p.methodOther)}</span>
              {p.reference && (
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  ref {p.reference}
                </span>
              )}
              <span className="flex-1" />
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  disabled={busyId === p.id}
                  onClick={() => remove(p.id, p.amount)}
                  aria-label="Delete payment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!canEdit ? null : adding ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount ($)</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-date">Received on</Label>
              <Input
                id="pay-date"
                type="date"
                value={form.receivedAt}
                onChange={(e) => setForm((f) => ({ ...f, receivedAt: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select
                value={form.method}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, method: (v ?? "Check") as PaymentMethodValue }))
                }
              >
                <SelectTrigger>
                  <SelectValue>{(value) => String(value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-ref">Reference</Label>
              <Input
                id="pay-ref"
                placeholder="Check no. / txn id"
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              />
            </div>
          </div>

          {form.method === "Other" && (
            <div className="space-y-2">
              <Label htmlFor="pay-other">What was it?</Label>
              <Input
                id="pay-other"
                placeholder="Wire transfer, barter, write-off…"
                value={form.methodOther}
                onChange={(e) => setForm((f) => ({ ...f, methodOther: e.target.value }))}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Record payment"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" /> Record a payment
        </Button>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${emphasis ? "text-[var(--viz-warn)]" : ""}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

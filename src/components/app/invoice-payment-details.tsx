"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { updateInvoicePaymentDetails } from "@/app/(app)/invoices/actions";
import { PAYMENT_METHODS } from "@/lib/payment-methods";

/**
 * Sent date, paid date and payment method, editable directly.
 *
 * The status buttons stamp "now", which is correct for something happening
 * today and wrong for anything historical -- the imported invoices were sent
 * and paid weeks before this system existed. Without a way to correct them, a
 * July invoice recorded today never enters the 30-day chase list and its
 * payment counts toward the wrong month.
 */
export function InvoicePaymentDetails({
  invoiceId,
  sentAt,
  paidAt,
  paymentMethod,
}: {
  invoiceId: string;
  sentAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
}) {
  const router = useRouter();
  const [sent, setSent] = useState(sentAt ?? "");
  const [paid, setPaid] = useState(paidAt ?? "");
  const [method, setMethod] = useState(paymentMethod ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = sent !== (sentAt ?? "") || paid !== (paidAt ?? "") || method !== (paymentMethod ?? "");

  async function save() {
    setSaving(true);
    const result = await updateInvoicePaymentDetails(invoiceId, {
      sentAt: sent || null,
      paidAt: paid || null,
      paymentMethod: method || null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Payment details saved");
    router.refresh();
  }

  return (
    <div className="grid gap-4 sm:grid-cols-4 sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="sentAt">Sent on</Label>
        <Input id="sentAt" type="date" value={sent} onChange={(e) => setSent(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="paidAt">Paid on</Label>
        <Input id="paidAt" type="date" value={paid} onChange={(e) => setPaid(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Paid by</Label>
        <Select value={method || "none"} onValueChange={(v) => setMethod(v === "none" ? "" : (v ?? ""))}>
          <SelectTrigger>
            <SelectValue placeholder="Not recorded">
              {(value) => (value === "none" || !value ? "Not recorded" : String(value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not recorded</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={save} disabled={!dirty || saving}>
        {saving ? "Saving…" : "Save"}
      </Button>

      <p className="text-xs text-muted-foreground sm:col-span-4">
        Setting a paid date marks the invoice Paid; setting only a sent date marks it Sent. Use the
        real dates for historical invoices — the follow-up list and monthly figures read them.
      </p>
    </div>
  );
}

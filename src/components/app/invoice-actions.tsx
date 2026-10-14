"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createInvoiceGmailDraft,
  finalizeInvoice,
  markInvoicePaid,
  markInvoiceSent,
  unvoidInvoice,
  regenerateInvoicePdf,
  voidInvoice,
} from "@/app/(app)/invoices/actions";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

/**
 * Draft -> Invoiced. The step that makes the document real.
 *
 * Separate from sending on purpose. An invoice can be issued and then posted,
 * handed over, or paid off a downloaded PDF -- none of which involve email --
 * and before this existed all of those had to be recorded as "Sent", which
 * was simply untrue.
 */
export function ConfirmInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleClick() {
    if (
      !confirm(
        "Confirm this as a final invoice?\n\nThe numbers are locked in and it stops counting as a draft. You can still download it, email it, or void it.",
      )
    ) {
      return;
    }
    setPending(true);
    const result = await finalizeInvoice(invoiceId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Confirmed — this is now an issued invoice");
    router.refresh();
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      <CheckCircle2 className="mr-1 h-4 w-4" />
      {pending ? "Confirming…" : "Confirm as invoice"}
    </Button>
  );
}

/**
 * Two-step, deliberately: invoices leave as a Gmail draft that a human
 * reviews and sends, then the status is confirmed here. "Mark as sent" is
 * the only thing that flips the invoice to Sent -- creating a draft doesn't,
 * because an unsent draft isn't a sent invoice.
 */
export function SendInvoiceActions({
  invoiceId,
  googleConfigured,
  signatures,
}: {
  invoiceId: string;
  googleConfigured: boolean;
  /** The signed-in user's own saved signatures, default first. */
  signatures: { id: string; name: string; isDefault: boolean }[];
}) {
  const [drafting, setDrafting] = useState(false);
  const [marking, setMarking] = useState(false);
  // "" means no signature -- a plain-text draft, which is what this did
  // before signatures existed.
  const [signatureId, setSignatureId] = useState(
    signatures.find((s) => s.isDefault)?.id ?? signatures[0]?.id ?? "",
  );

  async function handleDraft() {
    setDrafting(true);
    const result = await createInvoiceGmailDraft(invoiceId, signatureId || null);
    setDrafting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.reused
        ? "Gmail draft updated — the existing draft was refreshed, not duplicated."
        : "Gmail draft created — review and send it, then Mark as sent.",
      {
        action: {
          label: "Open draft",
          onClick: () => window.open(result.data.draftUrl, "_blank", "noopener,noreferrer"),
        },
        duration: 15_000,
      },
    );
  }

  async function handleMarkSent() {
    if (!confirm("Confirm this invoice has actually reached the client?")) return;
    setMarking(true);
    const result = await markInvoiceSent(invoiceId);
    setMarking(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Invoice marked as Sent");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {signatures.length > 0 && (
          <Select
            value={signatureId || "none"}
            onValueChange={(v) => setSignatureId(v === "none" ? "" : (v ?? ""))}
          >
            <SelectTrigger className="w-[190px]" aria-label="Signature">
              <SelectValue placeholder="No signature">
                {(value) => signatures.find((s) => s.id === value)?.name ?? "No signature"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No signature</SelectItem>
              {signatures.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" onClick={handleDraft} disabled={drafting || !googleConfigured}>
          {drafting ? "Creating draft…" : "Create Gmail draft"}
        </Button>
        <Button onClick={handleMarkSent} disabled={marking}>
          {marking ? "Saving…" : "Mark as sent"}
        </Button>
      </div>
      {!googleConfigured ? (
        <p className="text-xs text-muted-foreground">
          Google Workspace is not connected in the demo
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Or download the PDF and send it yourself, then mark it sent.
        </p>
      )}
    </div>
  );
}

export function MarkPaidButton({ invoiceId }: { invoiceId: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await markInvoicePaid(invoiceId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Invoice marked as Paid");
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      {pending ? "Saving…" : "Mark paid"}
    </Button>
  );
}

export function RetryPdfButton({ invoiceId }: { invoiceId: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await regenerateInvoicePdf(invoiceId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("PDF regenerated");
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? "Rendering…" : "Retry PDF"}
    </Button>
  );
}

/**
 * Void confirmation.
 *
 * The brief requires this to *show* client, amount, and linked-entry count --
 * not just ask yes/no -- so those are passed in as props (the detail page has
 * already loaded them) rather than re-fetched on open.
 */
export function VoidInvoiceDialog({
  invoiceId,
  invoiceNumber,
  clientName,
  totalAmount,
  timeEntryCount,
  recurringChargeCount,
  reimbursableExpenseCount,
}: {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  totalAmount: number;
  timeEntryCount: number;
  recurringChargeCount: number;
  reimbursableExpenseCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleVoid() {
    setPending(true);
    const result = await voidInvoice(invoiceId);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setOpen(false);
    if (!result.data.pdfArchived) {
      toast.warning(
        "Invoice voided, but its PDF couldn't be moved to the archive. Archive it manually.",
      );
    } else {
      toast.success(`Invoice ${invoiceNumber} voided`);
    }
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="text-destructive">
            Void
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void invoice {invoiceNumber}?</DialogTitle>
          <DialogDescription>
            This cannot be undone. The invoice number stays reserved and the PDF is archived
            rather than deleted.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3 py-4 text-sm">
          <dt className="text-muted-foreground">Client</dt>
          <dd className="text-right font-medium">{clientName}</dd>

          <dt className="text-muted-foreground">Amount</dt>
          <dd className="text-right font-medium">{formatCurrency(totalAmount)}</dd>

          <dt className="text-muted-foreground">Time entries released</dt>
          <dd className="text-right font-medium">{timeEntryCount}</dd>

          <dt className="text-muted-foreground">Recurring charges released</dt>
          <dd className="text-right font-medium">{recurringChargeCount}</dd>

          <dt className="text-muted-foreground">Expenses released</dt>
          <dd className="text-right font-medium">{reimbursableExpenseCount}</dd>
        </dl>

        <p className="text-sm text-muted-foreground">
          Those {timeEntryCount} time {timeEntryCount === 1 ? "entry" : "entries"}
          {reimbursableExpenseCount > 0
            ? ` and ${reimbursableExpenseCount} expense${reimbursableExpenseCount === 1 ? "" : "s"} become`
            : " become"}{" "}
          unbilled and can be invoiced again.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleVoid} disabled={pending}>
            {pending ? "Voiding…" : "Void invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Row-level actions for the invoice list.
 *
 * The list is where someone works through a month's invoices in sequence, so
 * the single next step for each one belongs here rather than behind a click
 * into the detail page. Which action that is depends entirely on status, so
 * only one ever renders.
 */
export function InvoiceRowActions({
  invoiceId,
  status,
  voided,
}: {
  invoiceId: string;
  status: string;
  voided: boolean;
}) {
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (result.ok) toast.success(done);
    else toast.error(result.error ?? "Something went wrong.");
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/invoices/${invoiceId}`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        View
      </Link>

      {voided ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => unvoidInvoice(invoiceId), "Invoice restored as a draft")}
        >
          Unvoid
        </Button>
      ) : status === "Sent" ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => markInvoicePaid(invoiceId), "Marked as paid")}
        >
          Mark paid
        </Button>
      ) : status === "Invoiced" ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => markInvoiceSent(invoiceId), "Marked as sent")}
        >
          Mark sent
        </Button>
      ) : status === "Draft" ? (
        // A draft's next step is confirming it, not claiming it was sent --
        // the list should offer the same first move the detail page does.
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => finalizeInvoice(invoiceId), "Confirmed as an invoice")}
        >
          Confirm
        </Button>
      ) : null}
    </div>
  );
}

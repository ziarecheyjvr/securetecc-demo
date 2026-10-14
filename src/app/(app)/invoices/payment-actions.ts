"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { settle } from "@/lib/billing/payments";
import { paymentFormSchema, type PaymentFormValues } from "@/lib/validations/payment";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** yyyy-mm-dd -> the UTC midnight a @db.Date column stores. */
function toDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Recomputes the invoice's payment summary from its payment rows.
 *
 * status/paidAt/paymentMethod on the invoice are a cache of the payments, not
 * a second source of truth -- every write to payments goes through here, so
 * the two can never disagree. Everything already reading those columns (the
 * dashboard, the reports, the invoice list) keeps working untouched.
 */
async function resyncInvoice(
  tx: Parameters<Parameters<typeof withRLS>[1]>[0],
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { totalAmount: true, status: true, sentAt: true, issuedAt: true },
  });
  const payments = await tx.payment.findMany({
    where: { invoiceId },
    select: { amount: true, receivedAt: true, method: true, methodOther: true },
  });

  const s = settle(
    Number(invoice.totalAmount),
    payments.map((p) => ({
      amount: Number(p.amount),
      receivedAt: p.receivedAt,
      method: p.method,
      methodOther: p.methodOther,
    })),
  );

  // Fully covered -> Paid. Anything less is NOT Paid, even if it was before:
  // deleting a payment has to be able to take an invoice back out of the
  // paid figures, or a mistaken entry is uncorrectable.
  const status =
    s.state === "Paid" || s.state === "Overpaid"
      ? "Paid"
      : invoice.sentAt
        ? "Sent"
        : invoice.status === "Paid"
          ? "Invoiced"
          : invoice.status;

  const earliest = payments.length
    ? payments.reduce((a, p) => (p.receivedAt < a ? p.receivedAt : a), payments[0].receivedAt)
    : null;

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      status,
      // The date it was SETTLED when it is settled; while it is only part
      // paid, the first payment's date, so ageing reads from when money
      // actually started arriving.
      paidAt: s.settledOn ?? earliest,
      paymentMethod: s.principalMethod,
      issuedAt: invoice.issuedAt ?? invoice.sentAt ?? earliest,
    },
  });
}

export async function recordPayment(
  invoiceId: string,
  input: PaymentFormValues,
): Promise<ActionResult> {
  const parsed = paymentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const { authUserId, appUser } = await requireAdminContext();

  try {
    await withRLS(authUserId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: { id: true, organizationId: true },
      });
      // Deliberately allowed on a voided invoice: money that arrived, arrived.
      // Voiding the document does not unsend it, and losing the record is how
      // a payment ends up unreconciled against the bank statement.
      await tx.payment.create({
        data: {
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          amount: data.amount,
          receivedAt: toDateOnly(data.receivedAt),
          method: data.method,
          methodOther: data.method === "Other" ? data.methodOther : null,
          reference: data.reference || null,
          notes: data.notes || null,
          recordedByUserId: appUser.id,
        },
      });
      await resyncInvoice(tx, invoiceId);
    });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't record the payment." };
  }

  revalidatePaths(invoiceId);
  return { ok: true };
}

export async function updatePayment(
  paymentId: string,
  input: PaymentFormValues,
): Promise<ActionResult> {
  const parsed = paymentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const { authUserId } = await requireAdminContext();

  let invoiceId = "";
  try {
    invoiceId = await withRLS(authUserId, async (tx) => {
      const existing = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { invoiceId: true },
      });
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          amount: data.amount,
          receivedAt: toDateOnly(data.receivedAt),
          method: data.method,
          methodOther: data.method === "Other" ? data.methodOther : null,
          reference: data.reference || null,
          notes: data.notes || null,
        },
      });
      await resyncInvoice(tx, existing.invoiceId);
      return existing.invoiceId;
    });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't update the payment." };
  }

  revalidatePaths(invoiceId);
  return { ok: true };
}

/** Admin-only at the database too: deleting a payment rewrites history. */
export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const { authUserId } = await requireAdminContext();

  let invoiceId = "";
  try {
    invoiceId = await withRLS(authUserId, async (tx) => {
      const existing = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { invoiceId: true },
      });
      await tx.payment.delete({ where: { id: paymentId } });
      await resyncInvoice(tx, existing.invoiceId);
      return existing.invoiceId;
    });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't delete the payment." };
  }

  revalidatePaths(invoiceId);
  return { ok: true };
}

function revalidatePaths(invoiceId: string): void {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

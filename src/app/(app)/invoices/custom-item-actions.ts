"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { customItemFormSchema, type CustomItemFormValues } from "@/lib/validations/invoice-custom-item";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Hand-added invoice lines.
 *
 * All three actions re-total the invoice inside the same transaction rather
 * than leaving totalAmount to drift: the stored total is what the list, the
 * dashboard and the Gmail draft all read, so a line that isn't reflected in it
 * is worse than no line at all.
 *
 * A voided invoice is refused -- it has already released its time entries and
 * charges, and editing it would produce a document that no longer matches
 * what was billed. Sent and Paid are allowed, deliberately: correcting an
 * invoice after it has gone out is a real thing that happens, and the PDF is
 * regenerated from the new totals.
 */
async function retotal(tx: Parameters<Parameters<typeof withRLS>[1]>[0], invoiceId: string) {
  const [entries, expenses, charges, retainers, custom] = await Promise.all([
    tx.timeEntry.findMany({ where: { invoiceId }, select: { durationHours: true } }),
    tx.reimbursableExpense.findMany({ where: { invoiceId }, select: { amount: true } }),
    tx.invoiceRecurringCharge.findMany({ where: { invoiceId }, select: { amount: true } }),
    tx.invoiceRetainerPeriod.findMany({ where: { invoiceId }, select: { amount: true } }),
    tx.invoiceCustomItem.findMany({ where: { invoiceId }, select: { amount: true, hours: true } }),
  ]);

  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { client: true, timeEntries: { include: { serviceType: true } } },
  });

  const isRetainer = invoice.client.billingType === "Retainer";
  const clientRate = invoice.client.billingRate ? Number(invoice.client.billingRate) : 0;

  const timeTotal = isRetainer
    ? 0 // retainer value comes from the retainer period rows below
    : invoice.timeEntries.reduce((sum, e) => {
        const rate = e.serviceType.rateOverride ? Number(e.serviceType.rateOverride) : clientRate;
        return sum + Number(e.durationHours) * rate;
      }, 0);

  const sum = (rows: { amount: unknown }[]) =>
    rows.reduce((s, r) => s + Number(r.amount), 0);

  const totalAmount =
    timeTotal + sum(expenses) + sum(charges) + sum(retainers) + sum(custom);
  const totalHours =
    entries.reduce((s, e) => s + Number(e.durationHours), 0) +
    custom.reduce((s, c) => s + Number(c.hours ?? 0), 0);

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      totalAmount: Number(totalAmount.toFixed(2)),
      totalHours: Number(totalHours.toFixed(2)),
    },
  });
}

async function assertEditable(
  tx: Parameters<Parameters<typeof withRLS>[1]>[0],
  invoiceId: string,
) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.voidedAt) throw new Error("This invoice is voided — unvoid it first.");
}

export async function addInvoiceCustomItem(
  invoiceId: string,
  input: CustomItemFormValues,
): Promise<ActionResult> {
  const parsed = customItemFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  try {
    const { authUserId } = await requireAdminContext();
    await withRLS(authUserId, async (tx) => {
      await assertEditable(tx, invoiceId);
      const last = await tx.invoiceCustomItem.findFirst({
        where: { invoiceId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      await tx.invoiceCustomItem.create({
        data: {
          invoiceId,
          date: data.date ? new Date(`${data.date}T00:00:00Z`) : null,
          description: data.description,
          hours: data.hours ?? null,
          rate: data.rate ?? null,
          amount: data.amount,
          sortOrder: (last?.sortOrder ?? 0) + 1,
        },
      });
      await retotal(tx, invoiceId);
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

export async function updateInvoiceCustomItem(
  id: string,
  invoiceId: string,
  input: CustomItemFormValues,
): Promise<ActionResult> {
  const parsed = customItemFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  try {
    const { authUserId } = await requireAdminContext();
    await withRLS(authUserId, async (tx) => {
      await assertEditable(tx, invoiceId);
      await tx.invoiceCustomItem.update({
        where: { id },
        data: {
          date: data.date ? new Date(`${data.date}T00:00:00Z`) : null,
          description: data.description,
          hours: data.hours ?? null,
          rate: data.rate ?? null,
          amount: data.amount,
        },
      });
      await retotal(tx, invoiceId);
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

export async function deleteInvoiceCustomItem(
  id: string,
  invoiceId: string,
): Promise<ActionResult> {
  try {
    const { authUserId } = await requireAdminContext();
    await withRLS(authUserId, async (tx) => {
      await assertEditable(tx, invoiceId);
      await tx.invoiceCustomItem.delete({ where: { id } });
      await retotal(tx, invoiceId);
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

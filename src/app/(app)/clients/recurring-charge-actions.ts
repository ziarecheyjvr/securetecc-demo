"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import {
  recurringChargeFormSchema,
  type RecurringChargeFormValues,
} from "@/lib/validations/recurring-charge";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** yyyy-mm-dd -> the UTC midnight a @db.Date column stores. */
function toDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function createRecurringCharge(
  clientId: string,
  input: RecurringChargeFormValues,
): Promise<ActionResult> {
  const parsed = recurringChargeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireOrgContext();

  try {
    await withRLS(authUserId, async (tx) => {
      // Continue the master sheet's RC-### series rather than starting a
      // parallel scheme -- the reference is how a charge is matched back to
      // the spreadsheet by eye.
      const last = await tx.recurringCharge.findFirst({
        where: { reference: { startsWith: "RC-" } },
        orderBy: { reference: "desc" },
        select: { reference: true },
      });
      const nextNumber = last?.reference ? Number(last.reference.slice(3)) + 1 : 1;

      const charge = await tx.recurringCharge.create({
        data: {
          organizationId: appUser.organizationId,
          clientId,
          reference: `RC-${String(nextNumber).padStart(3, "0")}`,
          notes: data.notes || null,
          description: data.description,
          amount: data.amount,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          cost: data.cost,
          startDate: toDateOnly(data.startDate),
          billingFrequency: data.billingFrequency,
          activeStatus: data.activeStatus,
          itemType: data.itemType,
          authorizedBy: data.authorizedBy,
        },
      });

      // Append-only history row, same transaction -- see the model's doc
      // comment. Never updated/deleted by app code.
      await tx.recurringChargeAuditLog.create({
        data: {
          organizationId: appUser.organizationId,
          recurringChargeId: charge.id,
          action: "created",
          itemType: data.itemType,
          description: data.description,
          amount: data.amount,
          billingFrequency: data.billingFrequency,
          authorizedBy: data.authorizedBy,
          notes: data.notes || null,
        },
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/time-entries/recurring-charges");
  revalidatePath("/settings/recurring-charges");
  return { ok: true };
}

export async function updateRecurringCharge(
  id: string,
  clientId: string,
  input: RecurringChargeFormValues,
): Promise<ActionResult> {
  const parsed = recurringChargeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireOrgContext();

  try {
    // Editing a template never rewrites history: past invoices carry their own
    // snapshot rows in invoice_recurring_charges, so changing the amount here
    // only affects future invoices. The audit log gets its own new row rather
    // than updating the "created" one, for the same reason.
    await withRLS(authUserId, async (tx) => {
      await tx.recurringCharge.update({
        where: { id },
        data: {
          description: data.description,
          amount: data.amount,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          cost: data.cost,
          startDate: toDateOnly(data.startDate),
          billingFrequency: data.billingFrequency,
          activeStatus: data.activeStatus,
          itemType: data.itemType,
          authorizedBy: data.authorizedBy,
          notes: data.notes || null,
        },
      });

      await tx.recurringChargeAuditLog.create({
        data: {
          organizationId: appUser.organizationId,
          recurringChargeId: id,
          action: "updated",
          itemType: data.itemType,
          description: data.description,
          amount: data.amount,
          billingFrequency: data.billingFrequency,
          authorizedBy: data.authorizedBy,
          notes: data.notes || null,
        },
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/time-entries/recurring-charges");
  revalidatePath("/settings/recurring-charges");
  return { ok: true };
}

export async function deleteRecurringCharge(
  id: string,
  clientId: string,
): Promise<ActionResult> {
  const { authUserId } = await requireOrgContext();

  try {
    await withRLS(authUserId, (tx) => tx.recurringCharge.delete({ where: { id } }));
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/time-entries/recurring-charges");
  revalidatePath("/settings/recurring-charges");
  return { ok: true };
}

function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: string }).code;
    // Foreign key violation: snapshot rows on past invoices still reference it.
    if (code === "P2003") {
      return "This charge has been billed on past invoices and can't be deleted. Mark it inactive instead.";
    }
    if (code === "P2025") {
      return "That recurring charge no longer exists.";
    }
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

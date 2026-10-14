"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import {
  businessExpenseFormSchema,
  type BusinessExpenseFormValues,
} from "@/lib/validations/business-expense";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** yyyy-mm-dd -> the UTC midnight a @db.Date column stores. */
function toDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fields(data: BusinessExpenseFormValues) {
  return {
    name: data.name,
    vendor: data.vendor || null,
    category: data.category || null,
    amount: data.amount,
    frequency: data.frequency,
    // Empty means overhead -- a cost the business carries rather than one
    // belonging to a single client.
    clientId: data.clientId || null,
    startDate: toDateOnly(data.startDate),
    endDate: toDateOnly(data.endDate),
    activeStatus: data.activeStatus,
    notes: data.notes || null,
  };
}

export async function createBusinessExpense(
  input: BusinessExpenseFormValues,
): Promise<ActionResult> {
  const parsed = businessExpenseFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { authUserId, appUser } = await requireAdminContext();

  try {
    await withRLS(authUserId, (tx) =>
      tx.businessExpense.create({
        data: { organizationId: appUser.organizationId, ...fields(parsed.data) },
      }),
    );
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save that cost." };
  }

  revalidate();
  return { ok: true };
}

export async function updateBusinessExpense(
  id: string,
  input: BusinessExpenseFormValues,
): Promise<ActionResult> {
  const parsed = businessExpenseFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { authUserId } = await requireAdminContext();

  try {
    await withRLS(authUserId, (tx) =>
      tx.businessExpense.update({ where: { id }, data: fields(parsed.data) }),
    );
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't update that cost." };
  }

  revalidate();
  return { ok: true };
}

export async function deleteBusinessExpense(id: string): Promise<ActionResult> {
  const { authUserId } = await requireAdminContext();
  try {
    await withRLS(authUserId, (tx) => tx.businessExpense.delete({ where: { id } }));
  } catch {
    return { ok: false, error: "Couldn't delete that cost." };
  }
  revalidate();
  return { ok: true };
}

function revalidate(): void {
  revalidatePath("/settings/expenses");
  revalidatePath("/reports");
}

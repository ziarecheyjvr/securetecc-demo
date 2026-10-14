"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import {
  reimbursableExpenseFormSchema,
  type ReimbursableExpenseFormValues,
} from "@/lib/validations/reimbursable-expense";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createReimbursableExpense(
  input: ReimbursableExpenseFormValues,
): Promise<ActionResult> {
  const parsed = reimbursableExpenseFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireOrgContext();

  try {
    await withRLS(authUserId, (tx) =>
      tx.reimbursableExpense.create({
        data: {
          organizationId: appUser.organizationId,
          clientId: data.clientId,
          date: new Date(data.date),
          description: data.description,
          amount: data.amount,
          loggedByUserId: appUser.id,
        },
      }),
    );
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/time-entries");
  return { ok: true };
}

export async function updateReimbursableExpense(
  id: string,
  input: ReimbursableExpenseFormValues,
): Promise<ActionResult> {
  const parsed = reimbursableExpenseFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId } = await requireOrgContext();

  try {
    // RLS ("reimbursable_expenses: staff can update unbilled, admin can update
    // any") is what actually blocks a technician from editing a billed
    // expense -- this update simply affects 0 rows if the policy denies it.
    await withRLS(authUserId, (tx) =>
      tx.reimbursableExpense.update({
        where: { id },
        data: {
          clientId: data.clientId,
          date: new Date(data.date),
          description: data.description,
          amount: data.amount,
        },
      }),
    );
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/time-entries");
  return { ok: true };
}

export async function deleteReimbursableExpense(id: string): Promise<ActionResult> {
  const { authUserId, appUser } = await requireOrgContext();

  try {
    await withRLS(authUserId, async (tx) => {
      // Check invoiceId explicitly first, so a technician trying to delete a
      // billed expense gets a clear message instead of a raw RLS-driven
      // "record not found" from the delete itself. Admins are still allowed
      // through -- RLS ("staff can delete unbilled, admin can delete any")
      // permits it too; the UI just asks for stronger confirmation for them.
      const expense = await tx.reimbursableExpense.findUniqueOrThrow({ where: { id } });
      if (expense.invoiceId && appUser.role !== "admin") {
        throw new AlreadyInvoicedError();
      }
      await tx.reimbursableExpense.delete({ where: { id } });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/time-entries");
  return { ok: true };
}

class AlreadyInvoicedError extends Error {}

function errorMessage(err: unknown): string {
  if (err instanceof AlreadyInvoicedError) {
    return "This expense has already been invoiced — ask an admin to void the invoice first.";
  }
  if (err instanceof Error) {
    if (err.message.includes("Record to update not found") || err.message.includes("No record")) {
      return "This expense is already billed and can no longer be edited by a technician.";
    }
    return err.message;
  }
  return "Something went wrong.";
}

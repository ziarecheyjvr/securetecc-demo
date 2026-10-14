"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, getCurrentAuthUserId } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { serviceTypeFormSchema, type ServiceTypeFormValues } from "@/lib/validations/service-type";

export type ActionResult = { ok: true } | { ok: false; error: string };

function normalizeRateOverride(value: number | undefined): number | null {
  return value === undefined || Number.isNaN(value) ? null : value;
}

/** yyyy-mm-dd -> the UTC midnight a @db.Date column stores. */
function toDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function createServiceType(input: ServiceTypeFormValues): Promise<ActionResult> {
  const parsed = serviceTypeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const appUser = await requireAdmin();
  const authUserId = await getCurrentAuthUserId();

  try {
    await withRLS(authUserId, (tx) =>
      tx.serviceType.create({
        data: {
          organizationId: appUser.organizationId,
          code: data.code,
          label: data.label,
          billingMinimumHours: data.billingMinimumHours,
          rateOverride: normalizeRateOverride(data.rateOverride),
          scheduledRate: normalizeRateOverride(data.scheduledRate),
          scheduledRateFrom: toDateOnly(data.scheduledRateFrom),
        },
      }),
    );
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, error: "A service type with this code already exists." };
    }
    throw err;
  }

  revalidatePath("/settings/service-types");
  return { ok: true };
}

export async function updateServiceType(id: string, input: ServiceTypeFormValues): Promise<ActionResult> {
  const parsed = serviceTypeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  await requireAdmin();
  const authUserId = await getCurrentAuthUserId();

  try {
    await withRLS(authUserId, (tx) =>
      tx.serviceType.update({
        where: { id },
        data: {
          code: data.code,
          label: data.label,
          billingMinimumHours: data.billingMinimumHours,
          rateOverride: normalizeRateOverride(data.rateOverride),
          scheduledRate: normalizeRateOverride(data.scheduledRate),
          scheduledRateFrom: toDateOnly(data.scheduledRateFrom),
        },
      }),
    );
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, error: "A service type with this code already exists." };
    }
    throw err;
  }

  revalidatePath("/settings/service-types");
  return { ok: true };
}

export async function deleteServiceType(id: string): Promise<ActionResult> {
  await requireAdmin();
  const authUserId = await getCurrentAuthUserId();

  try {
    await withRLS(authUserId, (tx) => tx.serviceType.delete({ where: { id } }));
  } catch (err: unknown) {
    if (isForeignKeyConstraintError(err)) {
      return {
        ok: false,
        error: "This service type is used by existing time entries and can't be deleted.",
      };
    }
    throw err;
  }

  revalidatePath("/settings/service-types");
  return { ok: true };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function isForeignKeyConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2003"
  );
}

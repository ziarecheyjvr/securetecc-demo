"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { clientFormSchema, type ClientFormValues } from "@/lib/validations/client";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** yyyy-mm-dd -> the UTC midnight a @db.Date column stores. */
function toDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function createClientRecord(input: ClientFormValues): Promise<ActionResult> {
  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireOrgContext();

  try {
    await withRLS(authUserId, (tx) =>
      tx.client.create({
        data: {
          organizationId: appUser.organizationId,
          name: data.name,
          shortName: data.shortName,
          ownerName: data.ownerName || null,
          billingContactName: data.billingContactName || null,
          email: data.email || null,
          phone: data.phone || null,
          address1: data.address1 || null,
          address2: data.address2 || null,
          cityStateZip: data.cityStateZip || null,
          billingType: data.billingType,
          billingCadence: data.billingCadence,
          billingRate: normalizeBillingRate(data.billingRate),
          scheduledRate: normalizeBillingRate(data.scheduledRate),
          scheduledRateFrom: toDateOnly(data.scheduledRateFrom),
          serviceArea: data.serviceArea,
          leadSource: data.leadSource,
          leadSourceNote: data.leadSourceNote || null,
          relationshipStartedOn: toDateOnly(data.relationshipStartedOn),
          activeStatus: data.activeStatus,
          isInternal: data.isInternal,
          notes: data.notes || null,
        },
      }),
    );
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, error: "A client with this short name already exists." };
    }
    throw err;
  }

  revalidatePath("/clients");
  return { ok: true };
}

export async function updateClientRecord(id: string, input: ClientFormValues): Promise<ActionResult> {
  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId } = await requireOrgContext();

  try {
    await withRLS(authUserId, (tx) =>
      tx.client.update({
        where: { id },
        data: {
          name: data.name,
          shortName: data.shortName,
          ownerName: data.ownerName || null,
          billingContactName: data.billingContactName || null,
          email: data.email || null,
          phone: data.phone || null,
          address1: data.address1 || null,
          address2: data.address2 || null,
          cityStateZip: data.cityStateZip || null,
          billingType: data.billingType,
          billingCadence: data.billingCadence,
          billingRate: normalizeBillingRate(data.billingRate),
          scheduledRate: normalizeBillingRate(data.scheduledRate),
          scheduledRateFrom: toDateOnly(data.scheduledRateFrom),
          serviceArea: data.serviceArea,
          leadSource: data.leadSource,
          leadSourceNote: data.leadSourceNote || null,
          relationshipStartedOn: toDateOnly(data.relationshipStartedOn),
          activeStatus: data.activeStatus,
          isInternal: data.isInternal,
          notes: data.notes || null,
        },
      }),
    );
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, error: "A client with this short name already exists." };
    }
    throw err;
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function setClientActiveStatus(id: string, activeStatus: boolean): Promise<ActionResult> {
  const { authUserId } = await requireOrgContext();

  await withRLS(authUserId, (tx) =>
    tx.client.update({ where: { id }, data: { activeStatus } }),
  );

  revalidatePath("/clients");
  return { ok: true };
}

function normalizeBillingRate(value: number | undefined): number | null {
  return value === undefined || Number.isNaN(value) ? null : value;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { signatureFormSchema, type SignatureFormValues } from "@/lib/validations/signature";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

export type SavedSignature = {
  id: string;
  name: string;
  html: string;
  isDefault: boolean;
};

/**
 * Saves the signature currently on screen under a name.
 *
 * Re-saving the same name overwrites it: the generator is a live form, and
 * someone tweaking their title expects "Save" to update "Tony — main", not to
 * refuse or to leave two near-identical entries behind.
 */
export async function saveSignature(
  input: SignatureFormValues,
): Promise<ActionResult<SavedSignature>> {
  const parsed = signatureFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, html, isDefault } = parsed.data;
  const { authUserId, appUser } = await requireOrgContext();

  try {
    const saved = await withRLS(authUserId, async (tx) => {
      if (isDefault) {
        await tx.emailSignature.updateMany({
          where: { ownerUserId: appUser.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.emailSignature.upsert({
        where: { ownerUserId_name: { ownerUserId: appUser.id, name } },
        create: {
          organizationId: appUser.organizationId,
          ownerUserId: appUser.id,
          name,
          html,
          isDefault,
        },
        update: { html, isDefault },
        select: { id: true, name: true, html: true, isDefault: true },
      });
    });

    revalidatePath("/signature");
    return { ok: true, data: saved };
  } catch {
    return { ok: false, error: "Couldn't save that signature. Try again." };
  }
}

export async function deleteSignature(id: string): Promise<ActionResult> {
  const { authUserId, appUser } = await requireOrgContext();
  try {
    await withRLS(authUserId, (tx) =>
      tx.emailSignature.deleteMany({ where: { id, ownerUserId: appUser.id } }),
    );
    revalidatePath("/signature");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't delete that signature." };
  }
}

/** At most one default per person -- setting one clears the rest. */
export async function setDefaultSignature(id: string): Promise<ActionResult> {
  const { authUserId, appUser } = await requireOrgContext();
  try {
    await withRLS(authUserId, async (tx) => {
      await tx.emailSignature.updateMany({
        where: { ownerUserId: appUser.id, isDefault: true },
        data: { isDefault: false },
      });
      await tx.emailSignature.updateMany({
        where: { id, ownerUserId: appUser.id },
        data: { isDefault: true },
      });
    });
    revalidatePath("/signature");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't change the default signature." };
  }
}

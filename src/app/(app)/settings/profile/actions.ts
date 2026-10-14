"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import {
  ALLOWED_AVATAR_TYPES,
  MAX_AVATAR_BYTES,
  avatarPath,
  deleteAvatar,
  extensionFor,
  uploadAvatar,
} from "@/lib/storage/avatars";

export type ProfileResult = { ok: true } | { ok: false; error: string };

/** Days in a month, ignoring leap years -- Feb 29 is a real birthday. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Updates the signed-in user's own profile. Deliberately not admin-gated:
 * your name and photograph are yours, and routing them through an admin is
 * the same mistake as routing password changes through one.
 *
 * FormData rather than a typed object because the photo travels with it --
 * a File can't cross a server-action boundary inside a plain object.
 */
export async function updateProfile(formData: FormData): Promise<ProfileResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Please enter your name." };
  if (name.length > 120) return { ok: false, error: "That name is too long." };

  // "" means cleared, which is different from absent.
  const rawBirthday = String(formData.get("birthday") ?? "").trim();
  let birthMonth: number | null = null;
  let birthDay: number | null = null;
  if (rawBirthday) {
    // Parsed from the string, never via new Date(): "2026-02-14" through the
    // Date constructor is UTC midnight, which is Feb 13 in Pacific -- the bug
    // that would wish someone happy birthday a day early, every year.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawBirthday);
    if (!m) return { ok: false, error: "That date isn't valid." };
    birthMonth = Number(m[2]);
    birthDay = Number(m[3]);
    if (birthMonth < 1 || birthMonth > 12) return { ok: false, error: "That date isn't valid." };
    if (birthDay < 1 || birthDay > DAYS_IN_MONTH[birthMonth - 1]) {
      return { ok: false, error: "That date isn't valid." };
    }
  }

  const photo = formData.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;
  const removePhoto = String(formData.get("removePhoto") ?? "") === "true";

  let newPath: string | null = null;
  let contentType = "";
  let bytes: Buffer | null = null;

  if (hasPhoto) {
    if (!ALLOWED_AVATAR_TYPES.includes(photo.type)) {
      return { ok: false, error: "Use a JPG, PNG or WebP image." };
    }
    if (photo.size > MAX_AVATAR_BYTES) {
      return { ok: false, error: "That image is over 2MB — please use a smaller one." };
    }
    const ext = extensionFor(photo.type);
    if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP image." };
    bytes = Buffer.from(await photo.arrayBuffer());
    contentType = photo.type;
  }

  try {
    const { appUser } = await requireOrgContext();
    const previousPath = appUser.avatarPath;

    if (hasPhoto && bytes) {
      newPath = avatarPath(appUser.organizationId, appUser.id, extensionFor(contentType)!);
      // Uploaded BEFORE the row is updated: if the upload fails, the profile
      // still points at the old photo rather than at a path with nothing
      // behind it.
      await uploadAvatar(newPath, bytes, contentType);
    }

    await requireOrgContext((tx) =>
      tx.user.update({
        where: { id: appUser.id },
        data: {
          name,
          birthMonth,
          birthDay,
          ...(hasPhoto ? { avatarPath: newPath } : removePhoto ? { avatarPath: null } : {}),
        },
      }),
    );

    // Only once the row is safely updated -- deleting first would leave a
    // window where the profile references an object that is already gone.
    if ((hasPhoto || removePhoto) && previousPath && previousPath !== newPath) {
      await deleteAvatar(previousPath);
    }

    revalidatePath("/settings/profile");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save your profile.",
    };
  }
}

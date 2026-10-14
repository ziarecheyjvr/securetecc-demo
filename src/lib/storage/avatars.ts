import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "avatars";

/** 2MB: a profile photo, not a source image. Enforced before upload. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Storage path. orgId first, matching the other two buckets, because the RLS
 * policies scope on (storage.foldername(name))[1].
 *
 * The extension is part of the path so the object keeps a correct content
 * type, and a `v` suffix busts the signed-URL cache when someone replaces
 * their photo -- without it the old image can persist behind a still-valid
 * signed URL.
 */
export function avatarPath(orgId: string, userId: string, ext: string): string {
  return `${orgId}/${userId}-${Date.now()}.${ext}`;
}

export function extensionFor(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export async function uploadAvatar(path: string, file: Buffer, contentType: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Avatar upload failed: ${error.message}`);
}

/**
 * Signed URL for a stored avatar.
 *
 * An hour rather than the invoice route's 60 seconds: the avatar renders on
 * every page of the app shell, and a URL that expires mid-session would show
 * a broken image until the next navigation.
 *
 * Returns null instead of throwing -- a missing avatar must degrade to
 * initials, never break the layout it sits in.
 */
export async function getAvatarSignedUrl(
  path: string | null,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Best-effort cleanup of a replaced photo. Never fails the save. */
export async function deleteAvatar(path: string | null): Promise<void> {
  if (!path) return;
  try {
    await createAdminClient().storage.from(BUCKET).remove([path]);
  } catch {
    // An orphaned object costs a few KB; a failed profile save costs the user
    // their change. The former is the better trade.
  }
}

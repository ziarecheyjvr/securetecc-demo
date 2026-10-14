import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "ticket-attachments";

/**
 * Path convention from 0001_rls_policies.sql:
 *   {orgId}/{clientCompanyName}/{ticketNumber}/{fileName}
 * orgId must stay the first segment -- the bucket's RLS policies scope staff
 * reads on (storage.foldername(name))[1].
 */
export function ticketAttachmentPath(
  orgId: string,
  clientCompanyName: string,
  ticketNumber: string,
  fileName: string,
): string {
  return `${orgId}/${slug(clientCompanyName)}/${ticketNumber}/${slug(fileName)}`;
}

/**
 * Uploads a public submission's attachment.
 *
 * Runs through the service-role client rather than letting the browser upload
 * with the anon key: the submitter is unauthenticated, and this keeps the
 * storage path (and therefore the org scoping) entirely server-controlled.
 */
export async function uploadTicketAttachment(
  path: string,
  file: Buffer,
  contentType: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Attachment upload failed: ${error.message}`);
}

/** Short-lived signed URL; the bucket is private. */
export async function getTicketAttachmentSignedUrl(
  path: string,
  expiresInSeconds = 300,
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Could not sign attachment URL: ${error?.message}`);
  return data.signedUrl;
}

/** Keeps storage paths predictable and free of characters that break URLs. */
function slug(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w.\- ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "file";
}

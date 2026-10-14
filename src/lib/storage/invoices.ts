import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "invoices";

/**
 * Storage paths keep orgId as the first segment in both the active and
 * archived forms, because the bucket's RLS policies scope on
 * (storage.foldername(name))[1] -- see supabase/migrations/0002_invoicing.sql.
 */
export function invoicePdfPath(orgId: string, clientId: string, invoiceId: string): string {
  return `${orgId}/${clientId}/${invoiceId}.pdf`;
}

export function archivedInvoicePdfPath(
  orgId: string,
  clientId: string,
  invoiceId: string,
): string {
  return `${orgId}/archived/${clientId}/${invoiceId}.pdf`;
}

/**
 * Uploads a rendered invoice PDF. Uses the service-role client: this runs in
 * trusted server-side code right after the generation transaction, and the
 * bucket policies exist as defense-in-depth rather than as the access path.
 */
export async function uploadInvoicePdf(path: string, pdf: Buffer): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true, // regenerating a Draft's PDF should replace, not fail
  });
  if (error) throw new Error(`Invoice PDF upload failed: ${error.message}`);
}

/**
 * The name the client's browser saves the PDF under: "UPH-00003 - UWE-PMA
 * Holdings, LLC.pdf".
 *
 * Without this the download inherits the storage object's name, which is the
 * invoice's UUID -- a 36-character filename that tells whoever receives it
 * nothing. The storage path itself stays UUID-keyed (it must: it is the
 * stable key, and client names get renamed).
 */
export function invoicePdfFileName(invoiceNumber: string, clientName: string): string {
  // Slashes would read as directories and the rest are illegal on Windows.
  const safe = (value: string) =>
    value
      .replace(/[/\\:*?"<>|]/g, "-")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return `${safe(invoiceNumber)} - ${safe(clientName)}.pdf`.slice(0, 150);
}

/**
 * The Content-Disposition header that makes the browser save the PDF under
 * `fileName`.
 *
 * Set here rather than through Supabase's signed-URL `download` option: that
 * option encodes the name twice (URLSearchParams, then encodeURI over the
 * whole URL) and the storage server decodes it once, so "&" arrived as "%26"
 * and "," as "%2C" in the saved filename.
 *
 * `filename*` (RFC 6266 / 5987) carries the exact name, accents included;
 * the plain `filename` is an ASCII fallback for anything that ignores it.
 */
export function attachmentContentDisposition(fileName: string): string {
  const fallback = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Downloads a stored invoice PDF as a Buffer.
 *
 * Used to attach the real PDF to the Gmail draft -- the bucket is private,
 * so a Gmail draft can't just link to it, and a signed URL would expire --
 * and to serve "Download PDF" with a filename we control.
 */
export async function downloadInvoicePdf(path: string): Promise<Buffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Could not download invoice PDF: ${error?.message ?? "not found"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Moves a voided invoice's PDF under an `archived/` prefix.
 *
 * "Archive, don't hard-delete" is an explicit requirement -- the file stays in
 * the same private bucket so a Voided view can still open it. Returns the new
 * path, or null if there was nothing to move.
 */
export async function archiveInvoicePdf(
  currentPath: string,
  orgId: string,
  clientId: string,
  invoiceId: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const destination = archivedInvoicePdfPath(orgId, clientId, invoiceId);
  if (currentPath === destination) return destination;

  const { error } = await supabase.storage.from(BUCKET).move(currentPath, destination);
  if (error) {
    // Non-fatal: the void's DB effects are the correctness-critical part.
    // Caller surfaces this as a warning rather than rolling the void back.
    return null;
  }
  return destination;
}

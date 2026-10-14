"use server";

import { fileTypeFromBuffer } from "file-type";
import { prisma } from "@/lib/db/prisma";
import { withRLS } from "@/lib/db/rls";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  publicTicketSchema,
} from "@/lib/validations/ticket";
import {
  ticketAttachmentPath,
  uploadTicketAttachment,
} from "@/lib/storage/ticket-attachments";
import { notifyNewTicket } from "@/lib/email/notify";
import { checkRateLimit, getClientIp, rateLimitedMessage } from "@/lib/rate-limit";
import { verifyRecaptcha } from "@/lib/recaptcha";

// NOTE: every export from a "use server" file is a callable server action.

export type SubmitResult =
  | { ok: true; ticketNumber: string }
  | { ok: false; error: string };

export type TicketStatusResult =
  | {
      ok: true;
      found: true;
      ticketNumber: string;
      status: string;
      submittedAt: string;
      issueType: string;
    }
  | { ok: true; found: false }
  | { ok: false; error: string };

/**
 * Public ticket-status lookup, gated on ticket number + the email it was
 * filed under (not ticket number alone -- those are sequential and
 * guessable). Calls a SECURITY DEFINER SQL function rather than querying the
 * table directly: `anon` has no SELECT policy on `tickets` at all, by design
 * (see 0001_rls_policies.sql), and a blanket policy can't be scoped to "only
 * the row this specific query's WHERE matched." The function bypasses RLS
 * internally and returns only a narrow, safe column set -- see
 * supabase/migrations/0003_reimbursables_addon_audit_ticket_lookup.sql.
 *
 * Returns `found: false` (not an error) on any mismatch, on EITHER field --
 * never signals which one was wrong.
 */
export async function lookupTicketStatus(
  ticketNumber: string,
  contactEmail: string,
): Promise<TicketStatusResult> {
  const trimmedNumber = ticketNumber.trim();
  const trimmedEmail = contactEmail.trim();
  if (!trimmedNumber || !trimmedEmail) {
    return { ok: false, error: "Enter both your ticket number and email." };
  }

  // Two-factor-gated already (number + email), but still unauthenticated and
  // guessable enough to be worth capping -- ticket numbers are sequential.
  const ip = await getClientIp();
  const limited = await checkRateLimit(`ticket-status:${ip}`, 10, 3600);
  if (!limited.ok) {
    return { ok: false, error: rateLimitedMessage(limited.retryAfterSeconds) };
  }

  try {
    const rows = await withRLS(null, (tx) =>
      tx.$queryRaw<
        { ticket_number: string; status: string; submitted_at: Date; issue_type: string }[]
      >`select * from public.lookup_ticket_status(${trimmedNumber}, ${trimmedEmail})`,
    );

    const row = rows[0];
    if (!row) return { ok: true, found: false };

    return {
      ok: true,
      found: true,
      ticketNumber: row.ticket_number,
      status: row.status,
      submittedAt: row.submitted_at.toISOString(),
      issueType: row.issue_type,
    };
  } catch {
    return { ok: false, error: "Something went wrong looking that up. Please try again." };
  }
}

/**
 * Public, unauthenticated ticket submission.
 *
 * Security shape:
 *  - organizationId is resolved SERVER-SIDE and never read from the form, so a
 *    crafted payload can't file into another tenant.
 *  - The ticket row is inserted through withRLS(null), i.e. as the Postgres
 *    `anon` role, so the "tickets: anon can submit new tickets" policy in
 *    0001_rls_policies.sql actually gates it (status must be New, and
 *    assignedToUserId/internalNotes/resolvedAt must be null). Using the
 *    privileged client here would bypass exactly the guarantee that policy
 *    exists to provide.
 *  - The ticket-number counter lives on `organizations`, which anon has no
 *    rights to touch, so that single increment uses the trusted client -- the
 *    same category as seeding/bootstrap code. A later failure can leave a
 *    number unused, which is fine: numbers are sequential, not gapless.
 */
export async function submitPublicTicket(formData: FormData): Promise<SubmitResult> {
  const ip = await getClientIp();
  const limited = await checkRateLimit(`ticket-submit:${ip}`, 5, 3600);
  if (!limited.ok) {
    return { ok: false, error: rateLimitedMessage(limited.retryAfterSeconds) };
  }

  // Before anything is parsed or stored: a bot's submission should cost as
  // little as possible.
  const recaptcha = await verifyRecaptcha(
    typeof formData.get("recaptchaToken") === "string"
      ? (formData.get("recaptchaToken") as string)
      : null,
    "submit_ticket",
  );
  if (!recaptcha.ok) return { ok: false, error: recaptcha.error };

  const parsed = publicTicketSchema.safeParse({
    clientCompanyName: formData.get("clientCompanyName"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    callbackNumber: formData.get("callbackNumber"),
    issueType: formData.get("issueType"),
    urgency: formData.get("urgency"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Please attach at most ${MAX_ATTACHMENTS} files.` };
  }
  // Buffers are read once here and reused for the upload below, rather than
  // re-reading each file from formData a second time.
  const fileBuffers = new Map<File, Buffer>();
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `"${file.name}" is larger than 10MB.` };
    }
    if (
      !ALLOWED_ATTACHMENT_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_TYPES)[number])
    ) {
      return { ok: false, error: `"${file.name}" must be an image or PDF.` };
    }
    // The declared MIME type above is whatever the browser guessed from the
    // file extension -- trivially spoofed by renaming a file. Sniff the
    // actual magic bytes and require them to agree, on a public,
    // unauthenticated upload endpoint.
    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = await fileTypeFromBuffer(buffer);
    if (!sniffed || !ALLOWED_ATTACHMENT_TYPES.includes(sniffed.mime as (typeof ALLOWED_ATTACHMENT_TYPES)[number])) {
      return { ok: false, error: `"${file.name}" doesn't look like a valid image or PDF.` };
    }
    fileBuffers.set(file, buffer);
  }

  // Single-tenant for now; Phase 7 (tenant onboarding) turns this into
  // per-domain/per-slug resolution.
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!organization) {
    return { ok: false, error: "Support is not configured yet. Please call us instead." };
  }

  let ticketNumber: string;
  try {
    const org = await prisma.organization.update({
      where: { id: organization.id },
      data: { lastTicketSequence: { increment: 1 } },
      select: { lastTicketSequence: true },
    });
    ticketNumber = `TKT-${String(org.lastTicketSequence).padStart(4, "0")}`;
  } catch (err) {
    console.error("[support] ticket insert failed:", err);
    return { ok: false, error: "Something went wrong submitting your request. Please try again." };
  }

  // Raw INSERT rather than tx.ticket.create(), deliberately.
  //
  // Prisma's create() always compiles to INSERT ... RETURNING, and a RETURNING
  // clause is evaluated against the SELECT policy. `anon` has no SELECT policy
  // on tickets (by design -- the public must never read tickets back), so the
  // ORM path fails with 42501 "new row violates row-level security policy"
  // even though the INSERT itself is permitted. Generating the id here and
  // skipping RETURNING keeps the write inside the anon role instead of
  // widening anon's read access to make an ORM convenience work.
  const ticketId = crypto.randomUUID();
  try {
    await withRLS(null, (tx) =>
      tx.$executeRaw`
        insert into public.tickets
          (id, "organizationId", "ticketNumber", "clientCompanyName", "contactName",
           "contactEmail", "callbackNumber", "issueType", urgency, description, status, "createdAt")
        values (
          ${ticketId}, ${organization.id}, ${ticketNumber}, ${data.clientCompanyName},
          ${data.contactName}, ${data.contactEmail}, ${data.callbackNumber || null},
          ${data.issueType}, ${data.urgency}::"TicketUrgency", ${data.description},
          'New'::"TicketStatus", now()
        )
      `,
    );
  } catch (err) {
    console.error("[support] ticket insert failed:", err);
    return { ok: false, error: "Something went wrong submitting your request. Please try again." };
  }

  // Attachments upload after the ticket exists. A failure here must not lose
  // the request itself -- the description is the important part.
  const failed: string[] = [];
  for (const file of files) {
    try {
      const path = ticketAttachmentPath(
        organization.id,
        data.clientCompanyName,
        ticketNumber,
        file.name,
      );
      await uploadTicketAttachment(path, fileBuffers.get(file)!, file.type);
      // Same no-RETURNING reasoning as the ticket insert above.
      await withRLS(null, (tx) =>
        tx.$executeRaw`
          insert into public.ticket_attachments (id, "ticketId", "fileUrl", "fileName", "uploadedAt")
          values (${crypto.randomUUID()}, ${ticketId}, ${path}, ${file.name}, now())
        `,
      );
    } catch (err) {
      // Logged, not swallowed: this failure mode (an RLS policy gap on
      // ticket_attachments) was invisible for weeks because the only signal
      // was a generic "couldn't be attached" shown to the submitter.
      console.error(`[ticket ${ticketNumber}] attachment "${file.name}" failed:`, err);
      failed.push(file.name);
    }
  }

  // Confirmation + internal alert. Deliberately after the ticket is safely
  // stored and not awaited for correctness -- a mail failure must never make a
  // successfully-filed request look like it failed to the customer.
  await notifyNewTicket(ticketId);

  if (failed.length > 0) {
    return {
      ok: false,
      error:
        `Your request was submitted as ${ticketNumber}, but ${failed.join(", ")} ` +
        "couldn't be attached. Please reply to the confirmation email with the files.",
    };
  }

  return { ok: true, ticketNumber };
}

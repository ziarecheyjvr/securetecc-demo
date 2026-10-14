"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext, requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import {
  ticketStatusChangeSchema,
  type TicketStatusChangeValues,
} from "@/lib/validations/ticket";
import { getTicketAttachmentSignedUrl } from "@/lib/storage/ticket-attachments";
import { notifyTicketAssigned, notifyTicketStatusChange } from "@/lib/email/notify";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Changes status and records the notes written for that change, in one write.
 *
 * This shape is the whole point: the proven system emails the client on a
 * status change and includes internalNotes as they were AT THAT MOMENT. Notes
 * added a minute later never appear in the already-sent email. Making the
 * notes part of the same action (rather than a separate "save notes" button)
 * is what stops that mistake. Phase 5 hangs the actual email off this action.
 */
export async function changeTicketStatus(
  id: string,
  input: TicketStatusChangeValues,
): Promise<ActionResult> {
  const parsed = ticketStatusChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { status, internalNotes } = parsed.data;

  const { authUserId } = await requireOrgContext();
  const notes = internalNotes.trim();

  try {
    await withRLS(authUserId, async (tx) => {
      const ticket = await tx.ticket.findUniqueOrThrow({ where: { id } });

      await tx.ticket.update({
        where: { id },
        data: {
          status,
          // Append rather than overwrite: the note history is what a later
          // reader needs to understand why a ticket moved.
          internalNotes: notes.length > 0 ? appendNote(ticket.internalNotes, status, notes) : ticket.internalNotes,
          // resolvedAt drives the 7-day auto-close, so it tracks the status.
          resolvedAt:
            status === "Completed"
              ? new Date()
              : status === "Closed"
                ? ticket.resolvedAt
                : null,
        },
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  // Pass THIS change's notes explicitly rather than letting the email re-read
  // internalNotes -- that column now holds the whole appended history, and
  // re-reading would also pick up anything written after this moment. This is
  // the ordering requirement from the proven system.
  const sent = await notifyTicketStatusChange(id, notes.length > 0 ? notes : null);

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);

  if (!sent.ok && !sent.skipped) {
    // The status change itself succeeded; surface the mail problem without
    // pretending the whole action failed.
    return { ok: false, error: `Status updated, but the client email failed: ${sent.error}` };
  }
  return { ok: true };
}

export async function assignTicket(
  id: string,
  assignedToUserId: string | null,
): Promise<ActionResult> {
  const { authUserId, appUser } = await requireOrgContext();

  try {
    await withRLS(authUserId, (tx) =>
      tx.ticket.update({ where: { id }, data: { assignedToUserId } }),
    );
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  // After the write, and not allowed to fail it: the assignment is what
  // matters, the notification is a convenience.
  const sent = await notifyTicketAssigned(id, appUser.id);

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
  if (!sent.ok && !sent.skipped) {
    return { ok: false, error: `Assigned, but the notification email failed: ${sent.error}` };
  }
  return { ok: true };
}

export async function deleteTicket(id: string): Promise<ActionResult> {
  // Admin-only, matching the "tickets: staff can delete within org" policy,
  // which requires is_admin().
  const { authUserId } = await requireAdminContext();

  try {
    await withRLS(authUserId, (tx) => tx.ticket.delete({ where: { id } }));
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/tickets");
  return { ok: true };
}

export async function getAttachmentUrl(path: string): Promise<ActionResult<string>> {
  const { authUserId } = await requireOrgContext();

  try {
    // Confirm the attachment belongs to a ticket this session can see before
    // minting a signed URL -- the signed URL itself bypasses RLS once issued.
    const attachment = await withRLS(authUserId, (tx) =>
      tx.ticketAttachment.findFirst({ where: { fileUrl: path }, select: { id: true } }),
    );
    if (!attachment) return { ok: false, error: "Attachment not found." };

    return { ok: true, data: await getTicketAttachmentSignedUrl(path) };
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }
}

function appendNote(existing: string | null, status: string, note: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `[${stamp} · → ${status}] ${note}`;
  return existing && existing.trim().length > 0 ? `${existing}\n\n${entry}` : entry;
}

function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    if ((err as { code?: string }).code === "P2025") return "That ticket no longer exists.";
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

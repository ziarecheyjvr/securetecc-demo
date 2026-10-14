import { prisma } from "@/lib/db/prisma";

export const AUTO_CLOSE_AFTER_DAYS = 7;

/**
 * Closes tickets that have sat in Completed for 7+ days.
 *
 * Only Completed auto-closes. A ticket WaitingOnClient stays open however
 * long it waits -- closing one because the client was slow to reply would
 * discard work nobody has finished.
 *
 * Deliberately a plain module, NOT a "use server" action: every export of a
 * server-action file is callable from the browser, and this runs with no
 * authenticated user and spans every organization. Phase 5's cron route
 * imports it behind a CRON_SECRET check.
 *
 * Uses the trusted client for the same reason -- a scheduled job has no
 * session for withRLS to scope to.
 */
export async function autoCloseCompletedTickets(): Promise<{ closed: number }> {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.ticket.updateMany({
    where: { status: "Completed", resolvedAt: { lte: cutoff } },
    data: { status: "Closed" },
  });

  return { closed: result.count };
}

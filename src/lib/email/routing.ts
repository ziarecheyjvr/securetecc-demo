/**
 * Where ticket mail goes.
 *
 * Tony watches tickets somewhere other than his own inbox, and the address
 * the team watches is not necessarily the address clients reply to. Those two
 * jobs used to be the same field, so pointing one somewhere new moved the
 * other with it.
 *
 * supportEmail stays the public, client-facing address (the reply-to on every
 * client mail); ticketNotificationEmail is where internal ticket traffic is
 * delivered, and falls back to supportEmail, which is exactly what happened
 * before this existed.
 */
export function ticketInboxOf(org: {
  supportEmail: string;
  ticketNotificationEmail?: string | null;
}): string {
  return org.ticketNotificationEmail?.trim() || org.supportEmail;
}

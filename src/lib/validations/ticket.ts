import { z } from "zod";

export const ISSUE_TYPES = [
  "Computer / Workstation",
  "Network / Internet",
  "Email",
  "Printer",
  "Phone System",
  "Security / Virus",
  "Software",
  "Other",
] as const;

// Labels and response targets mirror the v1 client portal's published SLAs,
// so what a client sees on the form matches what they were promised.
export const URGENCY_LABELS: Record<string, string> = {
  Emergency: "Emergency — business unable to operate",
  Critical: "Critical — major functionality down, no workaround",
  High: "High — productivity affected, workaround exists",
  Medium: "Medium — standard request, single user",
  Low: "Low — minor issue or general question",
};

export const URGENCY_RESPONSE_TIMES: Record<string, string> = {
  Emergency: "1 business hour",
  Critical: "4 business hours",
  High: "8 business hours",
  Medium: "24 business hours",
  Low: "48 business hours",
};

/** Most urgent first — used for ordering and for the form's option list. */
export const URGENCY_ORDER = ["Emergency", "Critical", "High", "Medium", "Low"] as const;

/**
 * Badge colors, shared between the ticket list and detail pages.
 *
 * Emergency needs to read as visibly more alarming than Critical/High at a
 * glance, not just alphabetically first -- a solid fill vs. their tinted
 * outline, matching the darkest red/amber scale the v1 portal's response-time
 * list used.
 */
export const URGENCY_BADGE_CLASS: Record<string, string> = {
  Emergency: "border-transparent bg-red-600 text-white dark:bg-red-600 dark:text-white",
  Critical: "border-transparent bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  High: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Medium: "border-transparent bg-accent/15 text-foreground",
  Low: "border-transparent bg-muted text-muted-foreground",
};

// Public submission. Deliberately carries NO organizationId, status,
// assignedToUserId, or internalNotes: those are either resolved server-side or
// forbidden outright, and the anon RLS policy in 0001_rls_policies.sql enforces
// the same thing at the database level.
export const publicTicketSchema = z.object({
  clientCompanyName: z.string().min(1, "Company name is required"),
  contactName: z.string().min(1, "Your name is required"),
  contactEmail: z.string().email("Enter a valid email address"),
  callbackNumber: z.string().optional().or(z.literal("")),
  issueType: z.enum(ISSUE_TYPES),
  urgency: z.enum(URGENCY_ORDER),
  // 3 rather than 10: "Testing", "No wifi" and "PC dead" are all legitimate
  // reports, and a portal that argues with someone about how much detail
  // they've given is a portal they stop using. Enough to reject an empty or
  // accidental submit, not enough to gatekeep a terse but real one.
  description: z.string().trim().min(3, "Please describe the issue"),
});

export type PublicTicketValues = z.infer<typeof publicTicketSchema>;

/**
 * Status change always carries the notes written for it.
 *
 * The proven system emails the client on a status change and includes
 * internalNotes *as of that moment* -- notes added afterwards never appear in
 * the already-sent email. Binding them into one action is what stops a
 * technician writing the explanation a minute too late.
 */
export const ticketStatusChangeSchema = z.object({
  status: z.enum(["New", "InProgress", "WaitingOnClient", "Completed", "Closed"]),
  internalNotes: z.string(),
});

export type TicketStatusChangeValues = z.infer<typeof ticketStatusChangeSchema>;

/**
 * Per file, and across all files.
 *
 * Bounded by the transport, not by preference: attachments travel inside a
 * Server Action request, Vercel caps a serverless request body at 4.5 MB, and
 * next.config.ts sets the Server Action limit to 4 MB to stay inside that.
 * The form used to advertise 10 MB per file across 5 files -- a 50 MB promise
 * over a 1 MB pipe, which failed with a 413 that the form never showed.
 */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3MB each
export const MAX_ATTACHMENTS_TOTAL_BYTES = 3.5 * 1024 * 1024; // 3.5MB combined
export const MAX_ATTACHMENTS = 5;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
] as const;

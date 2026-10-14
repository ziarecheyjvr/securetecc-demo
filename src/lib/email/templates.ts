import { formatCurrency } from "@/lib/format";

/**
 * Branded HTML emails.
 *
 * Table-based layout with inline styles on purpose -- that's what survives
 * Outlook and Gmail. Colors come from the org record so a second tenant gets
 * its own branding without touching this file.
 */

export type Branding = {
  organizationName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  phone: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Preserves author line breaks without letting user text inject markup. */
function paragraphs(value: string): string {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/** Surfaces of the dark card. Fixed rather than derived from branding: the
 *  panel has to sit a shade above the card, and a brand colour alone can't
 *  say what "a shade above" is. */
const CARD = "#0A1E33";
const PANEL = "#0D2740";
const TEXT = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.62)";

/** Status wording carries its own colour, so state reads before the word does. */
const STATUS_COLORS: Record<string, string> = {
  New: "#06E1DC",
  InProgress: "#F5B942",
  "In Progress": "#F5B942",
  // Amber like In Progress, because the state means the same thing to the
  // reader: still open, not finished. The difference is who it is waiting on,
  // and the wording carries that.
  WaitingOnClient: "#F5B942",
  Completed: "#06E1DC",
  Closed: "rgba(255,255,255,0.62)",
};

/** The teal-bordered callout: a small uppercase label over a large value. */
function panel(label: string, value: string, valueColor = TEXT): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="background:${PANEL};border-left:4px solid #06E1DC;border-radius:8px;padding:18px 20px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#06E1DC;margin-bottom:6px;">${escapeHtml(label)}</div>
      <div style="font-size:22px;font-weight:700;color:${valueColor};">${escapeHtml(value)}</div>
    </td></tr>
  </table>`;
}

/** Teal uppercase section heading, e.g. "UPDATE DETAILS". */
function sectionLabel(text: string): string {
  return `<div style="font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#06E1DC;margin:22px 0 8px;">${escapeHtml(text)}</div>`;
}

/**
 * The dark card every ticket email is built in.
 *
 * Dark rather than the white card this used to be, matching the design in
 * use: the logo is light-on-dark artwork, and on a white ground it needed its
 * own navy header band, which read as two separate blocks stacked together.
 *
 * `portalUrl` is threaded all the way down to the footer so the status
 * checker stays reachable from every message, not just the ones with a
 * button.
 */
function shell(branding: Branding, bodyHtml: string, portalUrl?: string): string {
  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.organizationName)}" width="240" style="display:block;margin:0 auto;max-width:240px;height:auto;" />`
    : `<div style="font-size:22px;font-weight:700;color:${TEXT};text-align:center;">${escapeHtml(branding.organizationName)}</div>`;

  const portalLink = portalUrl
    ? ` · <a href="${escapeHtml(portalUrl)}" style="color:${MUTED};text-decoration:underline;">Support Portal</a>`
    : "";

  // The PAGE is light; the card stays dark. The outer #050F1D filled the whole
  // window in desktop Gmail, which read as a black slab around a navy box. A
  // light ground lets the card read as a card -- and the card is what carries
  // the branding, so nothing about the design it holds changes.
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F6F8;font-family:Arial,Helvetica,sans-serif;color:${TEXT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${CARD};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 24px 28px;border-bottom:2px solid #06E1DC;">
              ${logo}
            </td>
          </tr>
          <tr><td style="padding:28px 26px;font-size:15px;line-height:1.6;color:${TEXT};">${bodyHtml}</td></tr>
          <tr>
            <td style="padding:18px 24px;border-top:2px solid #06E1DC;font-size:13px;color:${MUTED};text-align:center;">
              <span style="color:#06E1DC;font-weight:700;">${escapeHtml(branding.organizationName)}</span>${portalLink}${branding.phone ? ` · ${escapeHtml(branding.phone)}` : ""}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
    <tr><td align="center">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:${escapeHtml(color)};color:#071E37;text-decoration:none;font-weight:700;font-size:15px;padding:15px 34px;border-radius:8px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

// --- tickets ---------------------------------------------------------------

export function ticketConfirmationEmail(
  branding: Branding,
  ticket: { ticketNumber: string; contactName: string; issueType: string; urgency: string; description: string },
  /**
   * Public status-lookup URL (ticket.securetecc.com/status). Optional so the
   * email still sends if the portal URL isn't configured -- the ticket number
   * in the body is the part that actually matters.
   */
  statusUrl?: string,
): { subject: string; html: string } {
  return {
    subject: `We have received your request (${ticket.ticketNumber})`,
    html: shell(
      branding,
      `<p style="margin:0 0 16px;">Hi ${escapeHtml(ticket.contactName)},</p>
       <p style="margin:0;">Thanks for reaching out. Your support request has been logged.</p>
       ${panel("Ticket number", ticket.ticketNumber)}
       <p style="margin:0 0 12px;">${escapeHtml(branding.organizationName)} will respond <span style="color:#06E1DC;font-weight:700;">by the next business day</span>.</p>
       <p style="margin:0;color:${MUTED};font-size:14px;">If you need to reference this request, just include the ticket number above.</p>
       ${statusUrl ? button(statusUrl, "Visit Support Portal", branding.accentColor) : ""}`,
      statusUrl,
    ),
  };
}

/**
 * Internal new-ticket alert, to the shared support inbox.
 *
 * Same card as the client-facing mail, different priorities in the body: the
 * urgency, who it's from and how to reach them come first, because this one
 * is triaged rather than read.
 */
export function ticketInternalAlertEmail(
  branding: Branding,
  ticket: {
    ticketNumber: string; clientCompanyName: string; contactName: string; contactEmail: string;
    callbackNumber?: string | null; issueType: string; urgency: string; description: string;
  },
  ticketUrl: string,
): { subject: string; html: string } {
  // Urgency is always in the subject, not just for high-priority tickets:
  // the inbox is triaged by scanning subject lines, and "no prefix" reading as
  // "routine" only works if you already know the convention.
  const row = (label: string, value: string) =>
    `<tr><td style="padding:7px 0;color:${MUTED};width:110px;">${escapeHtml(label)}</td><td style="padding:7px 0;color:${TEXT};">${escapeHtml(value)}</td></tr>`;

  return {
    subject: `New ${ticket.urgency} ${ticket.ticketNumber} – ${ticket.clientCompanyName}`,
    html: shell(
      branding,
      `<p style="margin:0;">New support request.</p>
       ${panel(`Ticket ${ticket.ticketNumber}`, ticket.urgency, STATUS_COLORS[ticket.urgency] ?? "#F5B942")}
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
         ${row("Company", ticket.clientCompanyName)}
         ${row("Contact", `${ticket.contactName} <${ticket.contactEmail}>`)}
         ${ticket.callbackNumber ? row("Callback", ticket.callbackNumber) : ""}
         ${row("Issue", ticket.issueType)}
       </table>
       ${sectionLabel("What they told us")}
       ${paragraphs(ticket.description)}
       ${button(ticketUrl, "Open ticket", branding.accentColor)}`,
    ),
  };
}

/**
 * Tells a technician a ticket is now theirs.
 *
 * Internal, so it leads with what they need to act -- number, urgency,
 * company and the issue itself -- rather than the reassurance a client-facing
 * mail opens with.
 */
export function ticketAssignedEmail(
  branding: Branding,
  ticket: {
    ticketNumber: string; clientCompanyName: string; issueType: string;
    urgency: string; description: string; assigneeName: string; assignedByName: string;
  },
  ticketUrl: string,
): { subject: string; html: string } {
  return {
    subject: `Assigned to you: ${ticket.ticketNumber} – ${ticket.clientCompanyName}`,
    html: shell(
      branding,
      `<h1 style="margin:0 0 12px;font-size:20px;">${escapeHtml(ticket.ticketNumber)} is yours</h1>
       <p style="margin:0 0 16px;">${escapeHtml(ticket.assignedByName)} assigned this to ${escapeHtml(ticket.assigneeName)}.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
         <tr><td style="padding:8px 0;color:#5B6B7C;width:120px;">Company</td><td style="padding:8px 0;">${escapeHtml(ticket.clientCompanyName)}</td></tr>
         <tr><td style="padding:8px 0;color:#5B6B7C;">Issue</td><td style="padding:8px 0;">${escapeHtml(ticket.issueType)}</td></tr>
         <tr><td style="padding:8px 0;color:#5B6B7C;">Urgency</td><td style="padding:8px 0;"><strong>${escapeHtml(ticket.urgency)}</strong></td></tr>
       </table>
       <p style="margin:16px 0;padding:12px;background:#f6f8fa;border-radius:6px;white-space:pre-wrap;">${escapeHtml(ticket.description)}</p>
       ${button(ticketUrl, "Open ticket", branding.accentColor)}`,
    ),
  };
}

/**
 * The standard sign-off on a closed ticket.
 *
 * Closing is the last thing a client hears about a request, and it was going
 * out as a bare status word -- "Closed", no explanation. Two sentences, no
 * more: this is a receipt, not a letter, and the longer version said things
 * the reader had not asked about.
 *
 * Sent whether or not the technician wrote a note, because closing is the one
 * transition where silence is worst. Any note appears above it, so the two
 * complement rather than compete.
 */
function closingMessage(branding: Branding): string {
  return `<p style="margin:16px 0 0;color:${MUTED};">This request is now closed and no further action is needed from you.</p>
     <p style="margin:14px 0 0;">Thank you for working with ${escapeHtml(branding.organizationName)}.</p>`;
}

export function ticketStatusChangeEmail(
  branding: Branding,
  ticket: { ticketNumber: string; contactName: string; status: string },
  /** Notes AS OF the moment of the change -- see changeTicketStatus. */
  notesForThisChange: string | null,
  /** Status-lookup URL, so every update keeps a route back to the portal. */
  statusUrl?: string,
): { subject: string; html: string } {
  const readable: Record<string, string> = {
    New: "New",
    InProgress: "In Progress",
    WaitingOnClient: "Waiting on you",
    Completed: "Completed",
    Closed: "Closed",
  };
  const label = readable[ticket.status] ?? ticket.status;
  const completed = ticket.status === "Completed";
  // The one status that asks the reader to do something. It gets its own
  // wording, because a client who is being waited on and isn't told so will
  // assume the ball is still in our court.
  const waiting = ticket.status === "WaitingOnClient";
  const closed = ticket.status === "Closed";
  const notes = notesForThisChange?.trim();

  return {
    subject: `Ticket ${ticket.ticketNumber} update: ${label}`,
    html: shell(
      branding,
      `<p style="margin:0 0 16px;">Hi ${escapeHtml(ticket.contactName)},</p>
       <p style="margin:0;">There's an update on your support request.</p>
       ${panel(`Ticket ${ticket.ticketNumber}`, label, STATUS_COLORS[ticket.status] ?? TEXT)}
       ${
         notes
           ? sectionLabel(
               completed
                 ? "What we did to resolve this"
                 : waiting
                   ? "What we need from you"
                   : closed
                     ? "Closing notes"
                     : "Update details",
             ) +
             paragraphs(notes)
           : ""
       }
       ${
         completed
           ? `<p style="margin:16px 0 0;color:${MUTED};">Thank you for your patience — please let us know if this fully resolves the issue.</p>`
           : waiting
             ? `<p style="margin:16px 0 0;color:${MUTED};">We've paused work on this until we hear back from you. Just reply to this email and we'll pick it straight back up.</p>`
             : closed
               ? closingMessage(branding)
               : ""
       }
       ${statusUrl ? button(statusUrl, "Visit Support Portal", branding.accentColor) : ""}`,
      statusUrl,
    ),
  };
}

// --- invoices --------------------------------------------------------------

/**
 * Covering note for an invoice PDF, as plain text.
 *
 * Deliberately not the branded HTML shell the other templates use: this is a
 * one-line note from Tony with the invoice attached, and the PDF already
 * carries the letterhead, totals and payment terms. Anything more here just
 * repeats the attachment in a worse format.
 */
export function invoiceEmail(
  branding: Branding,
  invoice: { invoiceNumber: string; clientName: string; periodStart: Date; periodEnd: Date; totalAmount: number },
): { subject: string; text: string } {
  const period = formatPeriodLabel(invoice.periodStart, invoice.periodEnd);

  // No sign-off: Tony reviews and sends these from his own mailbox, where his
  // Gmail signature is appended on send. Adding one here would double it up.
  return {
    subject: `Invoice ${invoice.invoiceNumber} from ${branding.organizationName}`,
    text: ["Hi,", "", `Please see the attached invoice for ${period}.`, ""].join("\n"),
  };
}

/** "July 2026", or "July – September 2026" when a period spans months. */
function formatPeriodLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  const a = fmt(start);
  const b = fmt(end);
  return a === b ? a : `${a} – ${b}`;
}

// --- staff digests ---------------------------------------------------------

export function weeklyTicketDigestEmail(
  branding: Branding,
  rows: { ticketNumber: string; clientCompanyName: string; urgency: string; status: string; ageDays: number }[],
): { subject: string; html: string } {
  const body =
    rows.length === 0
      ? `<p style="margin:0;">No open tickets. Clean slate.</p>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">
           <tr style="text-align:left;color:#5B6B7C;font-size:12px;">
             <th style="padding:8px 0;">Ticket</th><th style="padding:8px 0;">Company</th>
             <th style="padding:8px 0;">Urgency</th><th style="padding:8px 0;">Status</th><th style="padding:8px 0;">Age</th>
           </tr>
           ${rows
             .map(
               (r) => `<tr style="border-top:1px solid #e2e8f0;">
                 <td style="padding:10px 0;"><strong>${escapeHtml(r.ticketNumber)}</strong></td>
                 <td style="padding:10px 0;">${escapeHtml(r.clientCompanyName)}</td>
                 <td style="padding:10px 0;">${escapeHtml(r.urgency)}</td>
                 <td style="padding:10px 0;">${escapeHtml(r.status)}</td>
                 <td style="padding:10px 0;">${r.ageDays}d</td>
               </tr>`,
             )
             .join("")}
         </table>`;

  return {
    subject: `Weekly ticket digest — ${rows.length} open`,
    html: shell(branding, `<h1 style="margin:0 0 14px;font-size:20px;">Open tickets</h1>${body}`),
  };
}

export function monthlySummaryEmail(
  branding: Branding,
  month: string,
  rows: { clientName: string; billableHours: number; nonBillableHours: number; invoicedAmount: number; uninvoicedAmount: number }[],
): { subject: string; html: string } {
  const totalInvoiced = rows.reduce((s, r) => s + r.invoicedAmount, 0);
  const totalUninvoiced = rows.reduce((s, r) => s + r.uninvoicedAmount, 0);

  return {
    subject: `Monthly summary — ${month}`,
    html: shell(
      branding,
      `<h1 style="margin:0 0 6px;font-size:20px;">${escapeHtml(month)} summary</h1>
       <p style="margin:0 0 16px;color:#5B6B7C;font-size:14px;">Invoiced ${escapeHtml(formatCurrency(totalInvoiced))} · not yet invoiced ${escapeHtml(formatCurrency(totalUninvoiced))}</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">
         <tr style="text-align:left;color:#5B6B7C;font-size:12px;">
           <th style="padding:8px 0;">Client</th><th style="padding:8px 0;">Billable</th>
           <th style="padding:8px 0;">Non-bill.</th><th style="padding:8px 0;">Invoiced</th><th style="padding:8px 0;">Pending</th>
         </tr>
         ${rows
           .map(
             (r) => `<tr style="border-top:1px solid #e2e8f0;">
               <td style="padding:10px 0;">${escapeHtml(r.clientName)}</td>
               <td style="padding:10px 0;">${r.billableHours}h</td>
               <td style="padding:10px 0;">${r.nonBillableHours}h</td>
               <td style="padding:10px 0;">${escapeHtml(formatCurrency(r.invoicedAmount))}</td>
               <td style="padding:10px 0;">${escapeHtml(formatCurrency(r.uninvoicedAmount))}</td>
             </tr>`,
           )
           .join("")}
       </table>`,
    ),
  };
}

const PRIORITY_COLORS: Record<string, string> = {
  Low: "rgba(255,255,255,0.62)",
  Medium: "#06E1DC",
  High: "#F5B942",
  Urgent: "#FF6B6B",
};

/**
 * "Tony assigned you a task".
 *
 * Built on the same dark card as the ticket mail rather than a new design --
 * this lands in the same inboxes, and a second visual language for internal
 * mail would just look like a different company wrote it.
 *
 * The description is rendered with white-space:pre-wrap so a multi-line brief
 * survives; it is escaped first, so a task written with angle brackets in it
 * cannot inject markup into the message.
 */
export function taskAssignedEmail(
  branding: Branding,
  task: {
    title: string;
    description: string | null;
    priority: string;
    assigneeName: string;
    assignedByName: string;
    startDate: string | null;
    dueDate: string | null;
  },
  taskUrl: string,
): { subject: string; html: string } {
  const rows: string[] = [
    `<tr><td style="padding:8px 0;color:#8FA3B5;width:110px;">Priority</td><td style="padding:8px 0;"><strong style="color:${PRIORITY_COLORS[task.priority] ?? TEXT};">${escapeHtml(task.priority)}</strong></td></tr>`,
  ];
  if (task.startDate) {
    rows.push(`<tr><td style="padding:8px 0;color:#8FA3B5;">Starts</td><td style="padding:8px 0;">${escapeHtml(task.startDate)}</td></tr>`);
  }
  if (task.dueDate) {
    rows.push(`<tr><td style="padding:8px 0;color:#8FA3B5;">Due</td><td style="padding:8px 0;"><strong>${escapeHtml(task.dueDate)}</strong></td></tr>`);
  }

  return {
    subject: `New task: ${task.title}`,
    html: shell(
      branding,
      `<h1 style="margin:0 0 12px;font-size:20px;">Hi ${escapeHtml(task.assigneeName.split(" ")[0])},</h1>
       <p style="margin:0 0 4px;">${escapeHtml(task.assignedByName)} has assigned you a task.</p>
       ${panel("Task", task.title)}
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
         ${rows.join("")}
       </table>
       ${
         task.description
           ? `${sectionLabel("Details")}
              <p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(task.description)}</p>`
           : ""
       }
       ${button(taskUrl, "Open task", branding.accentColor)}
       <p style="margin:20px 0 0;font-size:13px;color:#8FA3B5;">Update the status there as you go — In progress, then For review when it's ready to be checked.</p>`,
    ),
  };
}

/**
 * Tells the delegator that work is waiting on them.
 *
 * Without this, a task sitting in "For review" is invisible until someone
 * happens to open the page -- which turns a delegation tool into something
 * you have to remember to poll.
 */
export function taskForReviewEmail(
  branding: Branding,
  task: { title: string; assigneeName: string },
  taskUrl: string,
): { subject: string; html: string } {
  return {
    subject: `Ready for review: ${task.title}`,
    html: shell(
      branding,
      `<h1 style="margin:0 0 12px;font-size:20px;">Ready for your review</h1>
       <p style="margin:0 0 4px;">${escapeHtml(task.assigneeName)} has marked this task as done and ready to be checked.</p>
       ${panel("Task", task.title)}
       ${button(taskUrl, "Review task", branding.accentColor)}`,
    ),
  };
}

/**
 * Tells the delegator a task is finished.
 *
 * Distinct from the For review note above: "ready to be checked" asks for
 * something, "done" reports something. Sending the same mail for both would
 * make the one that needs action indistinguishable from the one that does
 * not.
 */
export function taskCompletedEmail(
  branding: Branding,
  task: { title: string; assigneeName: string; completedOn: string | null },
  taskUrl: string,
): { subject: string; html: string } {
  return {
    subject: `Completed: ${task.title}`,
    html: shell(
      branding,
      `<h1 style="margin:0 0 12px;font-size:20px;">Task completed</h1>
       <p style="margin:0 0 4px;">${escapeHtml(task.assigneeName)} has marked this task as completed${
         task.completedOn ? ` on ${escapeHtml(task.completedOn)}` : ""
       }.</p>
       ${panel("Task", task.title)}
       ${button(taskUrl, "Open task", branding.accentColor)}`,
    ),
  };
}

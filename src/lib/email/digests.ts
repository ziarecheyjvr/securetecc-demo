import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/client";
import { ticketInboxOf } from "@/lib/email/routing";
import {
  monthlySummaryEmail,
  weeklyTicketDigestEmail,
  type Branding,
} from "@/lib/email/templates";

/**
 * Scheduled staff digests. Plain module (not "use server") -- these run from
 * cron routes across all organizations with no user session.
 */

type Result = { organization: string; sent: number; skipped: number; errors: string[] };

async function organizations() {
  return prisma.organization.findMany();
}

function brandingOf(org: Awaited<ReturnType<typeof organizations>>[number]): Branding {
  return {
    organizationName: org.name,
    primaryColor: org.brandColorPrimary,
    accentColor: org.brandColorAccent,
    logoUrl: org.logoUrl,
    phone: org.phone,
  };
}

/** Weekly open-ticket digest to the shared ticket inbox. */
export async function sendWeeklyTicketDigests(): Promise<Result[]> {
  const results: Result[] = [];

  for (const org of await organizations()) {
    const result: Result = { organization: org.name, sent: 0, skipped: 0, errors: [] };

    const open = await prisma.ticket.findMany({
      // Includes WaitingOnClient: a ticket blocked on the client is exactly
      // the kind that quietly ages for a month, so the digest is where it
      // most needs to show up.
      where: {
        organizationId: org.id,
        status: { in: ["New", "InProgress", "WaitingOnClient"] },
      },
      orderBy: [{ urgency: "asc" }, { createdAt: "asc" }],
    });

    const rows = open.map((t) => ({
      ticketNumber: t.ticketNumber,
      clientCompanyName: t.clientCompanyName,
      urgency: t.urgency,
      status: t.status === "InProgress" ? "In progress" : t.status,
      ageDays: Math.floor((Date.now() - t.createdAt.getTime()) / 86_400_000),
    }));

    const email = weeklyTicketDigestEmail(brandingOf(org), rows);

    // One send to the shared support inbox, not a copy per staff member.
    // This is a queue summary the team acts on together -- fanning it out to
    // three individual mailboxes just meant three people each assuming
    // someone else had picked it up.
    const to = ticketInboxOf(org);
    const sent = await sendEmail({
      to,
      from: org.notificationFromEmail ?? org.supportEmail,
      subject: email.subject,
      html: email.html,
      emailDomainVerified: org.emailDomainVerified,
    });
    if (sent.ok) result.sent++;
    else if (sent.skipped) result.skipped++;
    else result.errors.push(`${to}: ${sent.error}`);

    results.push(result);
  }

  return results;
}

/**
 * Monthly per-client summary: billable vs non-billable hours, and how much of
 * it has actually been invoiced.
 */
export async function sendMonthlySummaries(): Promise<Result[]> {
  const results: Result[] = [];

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const monthLabel = periodStart.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  for (const org of await organizations()) {
    const result: Result = { organization: org.name, sent: 0, skipped: 0, errors: [] };

    const clients = await prisma.client.findMany({
      where: { organizationId: org.id },
      include: {
        timeEntries: {
          where: { date: { gte: periodStart, lte: periodEnd } },
          include: { serviceType: true },
        },
      },
    });

    const rows = clients
      .map((client) => {
        const clientRate = client.billingRate ? Number(client.billingRate) : null;
        let billableHours = 0;
        let nonBillableHours = 0;
        let invoicedAmount = 0;
        let uninvoicedAmount = 0;

        for (const entry of client.timeEntries) {
          const hours = Number(entry.durationHours);
          if (entry.billableStatus !== "Billable") {
            nonBillableHours += hours;
            continue;
          }
          billableHours += hours;

          const rate =
            (entry.serviceType.rateOverride ? Number(entry.serviceType.rateOverride) : null) ??
            clientRate ??
            0;
          const amount = hours * rate;
          if (entry.invoiceId) invoicedAmount += amount;
          else uninvoicedAmount += amount;
        }

        return {
          clientName: client.name,
          billableHours: Number(billableHours.toFixed(2)),
          nonBillableHours: Number(nonBillableHours.toFixed(2)),
          invoicedAmount: Number(invoicedAmount.toFixed(2)),
          uninvoicedAmount: Number(uninvoicedAmount.toFixed(2)),
        };
      })
      .filter((r) => r.billableHours > 0 || r.nonBillableHours > 0);

    const email = monthlySummaryEmail(brandingOf(org), monthLabel, rows);
    const staff = await prisma.user.findMany({ where: { organizationId: org.id } });

    for (const user of staff) {
      const sent = await sendEmail({
        to: user.email,
        from: org.notificationFromEmail ?? org.supportEmail,
        subject: email.subject,
        html: email.html,
        emailDomainVerified: org.emailDomainVerified,
      });
      if (sent.ok) result.sent++;
      else if (sent.skipped) result.skipped++;
      else result.errors.push(`${user.email}: ${sent.error}`);
    }

    results.push(result);
  }

  return results;
}

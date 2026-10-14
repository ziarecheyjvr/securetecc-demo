import Link from "next/link";
import { requireOrgContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { URGENCY_BADGE_CLASS } from "@/lib/validations/ticket";
import { TicketFilters } from "@/components/app/ticket-filters";
import type { TicketStatus, TicketUrgency } from "@/generated/prisma/enums";

const STATUS_FILTERS = ["Open", "New", "InProgress", "WaitingOnClient", "Completed", "Closed", "All"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const URGENCY_FILTERS = ["All", "Emergency", "Critical", "High", "Medium", "Low"] as const;
type UrgencyFilter = (typeof URGENCY_FILTERS)[number];

const STATUS_LABELS: Record<string, string> = {
  Open: "Open",
  New: "New",
  InProgress: "In progress",
  WaitingOnClient: "Waiting on client",
  Completed: "Completed",
  Closed: "Closed",
  All: "All",
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; urgency?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status: StatusFilter = STATUS_FILTERS.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "Open";
  const urgency: UrgencyFilter = URGENCY_FILTERS.includes(params.urgency as UrgencyFilter)
    ? (params.urgency as UrgencyFilter)
    : "All";
  const q = (params.q ?? "").trim();

  const { data: tickets } = await requireOrgContext((tx) =>
    tx.ticket.findMany({
      where: {
        // "Open" is the default working view: anything not yet put to bed.
        ...(status === "Open"
          ? { status: { in: ["New", "InProgress", "WaitingOnClient"] as TicketStatus[] } }
          : status === "All"
            ? {}
            : { status: status as TicketStatus }),
        ...(urgency === "All" ? {} : { urgency: urgency as TicketUrgency }),
        // Ticket number, company, contact name and email -- the four things
        // someone actually has to hand when hunting for a specific ticket.
        // Description is deliberately excluded: it turns a search for a
        // company name into a match on every ticket that mentions it.
        ...(q
          ? {
              OR: [
                { ticketNumber: { contains: q, mode: "insensitive" as const } },
                { clientCompanyName: { contains: q, mode: "insensitive" as const } },
                { contactName: { contains: q, mode: "insensitive" as const } },
                { contactEmail: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: { assignedToUser: { select: { name: true } }, _count: { select: { attachments: true } } },
      orderBy: [{ createdAt: "desc" }],
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-muted-foreground">
            {tickets.length} {STATUS_LABELS[status].toLowerCase()}
            {urgency !== "All" ? ` · ${urgency.toLowerCase()} urgency` : ""}
            {q ? ` · matching “${q}”` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          render={
            // The real client-facing portal (ticket.securetecc.com), not the
            // /support path on this host -- staff should see exactly what a
            // client sees. Falls back to the local route when the portal URL
            // isn't configured (dev, or before the domain is attached).
            <a
              href={process.env.NEXT_PUBLIC_TICKET_PORTAL_URL ?? "/support"}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          View public form
        </Button>
      </div>

      <TicketFilters status={status} urgency={urgency} q={q} />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell className="font-medium">
                  <Link href={`/tickets/${ticket.id}`} className="hover:underline">
                    {ticket.ticketNumber}
                  </Link>
                  {ticket._count.attachments > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {ticket._count.attachments} file
                      {ticket._count.attachments === 1 ? "" : "s"}
                    </span>
                  )}
                </TableCell>
                <TableCell>{ticket.clientCompanyName}</TableCell>
                {/* The person who raised it, not the client's owner or billing
                    contact -- a ticket is from whoever hit the form. */}
                <TableCell className="whitespace-nowrap">{ticket.contactName}</TableCell>
                <TableCell>{ticket.issueType}</TableCell>
                <TableCell>
                  <Badge className={URGENCY_BADGE_CLASS[ticket.urgency]}>{ticket.urgency}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={ticket.status === "New" ? "default" : "secondary"}>
                    {STATUS_LABELS[ticket.status] ?? ticket.status}
                  </Badge>
                </TableCell>
                <TableCell>{ticket.assignedToUser?.name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(ticket.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" render={<Link href={`/tickets/${ticket.id}`} />}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {tickets.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  No tickets match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

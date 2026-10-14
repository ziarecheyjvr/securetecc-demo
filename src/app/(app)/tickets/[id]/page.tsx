import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AttachmentLink,
  TicketAssignSelect,
  TicketStatusDialog,
} from "@/components/app/ticket-status-dialog";
import { formatDate } from "@/lib/format";
import { AUTO_CLOSE_AFTER_DAYS } from "@/lib/tickets/auto-close";
import { URGENCY_BADGE_CLASS, URGENCY_RESPONSE_TIMES } from "@/lib/validations/ticket";

const STATUS_LABELS: Record<string, string> = {
  New: "New",
  InProgress: "In progress",
  WaitingOnClient: "Waiting on client",
  Completed: "Completed",
  Closed: "Closed",
};

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const {
    data: [ticket, staff],
  } = await requireOrgContext(async (tx) => [
    await tx.ticket.findUnique({
      where: { id },
      include: {
        assignedToUser: { select: { id: true, name: true } },
        attachments: { orderBy: { uploadedAt: "asc" } },
      },
    }),
    await tx.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!ticket) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.ticketNumber}</h1>
            <Badge variant={ticket.status === "New" ? "default" : "secondary"}>
              {STATUS_LABELS[ticket.status]}
            </Badge>
            <Badge className={URGENCY_BADGE_CLASS[ticket.urgency]}>{ticket.urgency}</Badge>
          </div>
          <p className="text-muted-foreground">
            {ticket.clientCompanyName} · {ticket.issueType} · submitted{" "}
            {formatDate(ticket.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TicketAssignSelect
            ticketId={ticket.id}
            currentUserId={ticket.assignedToUserId}
            staff={staff}
          />
          <TicketStatusDialog ticketId={ticket.id} currentStatus={ticket.status} />
        </div>
      </div>

      {ticket.status === "Completed" && ticket.resolvedAt && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            Completed {formatDate(ticket.resolvedAt)} — closes automatically after{" "}
            {AUTO_CLOSE_AFTER_DAYS} days without further activity.
          </p>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <h2 className="mb-2 font-medium">Reported issue</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.description}</p>

          {ticket.attachments.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Attachments
              </h3>
              <div className="flex flex-wrap gap-2">
                {ticket.attachments.map((a) => (
                  <AttachmentLink key={a.id} path={a.fileUrl} fileName={a.fileName} />
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-medium">Contact</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd>{ticket.contactName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd>
                <a href={`mailto:${ticket.contactEmail}`} className="hover:underline">
                  {ticket.contactEmail}
                </a>
              </dd>
            </div>
            {ticket.callbackNumber && (
              <div>
                <dt className="text-muted-foreground">Callback number</dt>
                <dd>
                  <a href={`tel:${ticket.callbackNumber}`} className="hover:underline">
                    {ticket.callbackNumber}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Company</dt>
              <dd>{ticket.clientCompanyName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target response</dt>
              <dd>{URGENCY_RESPONSE_TIMES[ticket.urgency]}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-1 font-medium">Internal notes</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Written as part of each status change, and included in the client email for that
          change. Not editable after the fact.
        </p>
        {ticket.internalNotes ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {ticket.internalNotes}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
      </Card>

      <div>
        <Button variant="ghost" render={<Link href="/tickets" />}>
          ← Back to tickets
        </Button>
      </div>
    </div>
  );
}

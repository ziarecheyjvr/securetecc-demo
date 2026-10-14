"use client";

import { useState } from "react";
import { toast } from "sonner";
import { changeTicketStatus, assignTicket, getAttachmentUrl } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const STATUS_LABELS: Record<string, string> = {
  New: "New",
  InProgress: "In progress",
  WaitingOnClient: "Waiting on client",
  Completed: "Completed",
  Closed: "Closed",
};

/**
 * Status change + the notes for that change, in one submit.
 *
 * Notes are captured here rather than in a separate "save notes" box because
 * the client-facing status email includes internalNotes as of the moment of
 * the change -- notes written afterwards never reach the customer. The dialog
 * nudges toward writing them first by warning when the box is empty.
 */
export function TicketStatusDialog({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  const changed = status !== currentStatus;
  const missingNotes = changed && notes.trim().length === 0;

  async function handleSubmit() {
    setPending(true);
    const result = await changeTicketStatus(ticketId, { status: status as never, internalNotes: notes });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Ticket moved to ${STATUS_LABELS[status]}`);
    setNotes("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Update status</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update ticket status</DialogTitle>
          <DialogDescription>
            Notes are sent to the client with the status-change email, so write them here —
            anything added later won&apos;t be included.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? currentStatus)}>
              <SelectTrigger id="status">
                <SelectValue>{(v) => STATUS_LABELS[v as string]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes for this change</Label>
            <Textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was done, what's next, anything the client should know."
            />
            {missingNotes && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                No notes written — the client will get a status email with no explanation.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending || !changed}>
            {pending ? "Saving…" : "Save change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TicketAssignSelect({
  ticketId,
  currentUserId,
  staff,
}: {
  ticketId: string;
  currentUserId: string | null;
  staff: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(currentUserId ?? "unassigned");
  const [pending, setPending] = useState(false);

  async function handleChange(next: string) {
    setValue(next);
    setPending(true);
    const result = await assignTicket(ticketId, next === "unassigned" ? null : next);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      next === "unassigned"
        ? "Ticket unassigned"
        : `Assigned to ${staff.find((s) => s.id === next)?.name ?? "staff"}`,
    );
  }

  return (
    <Select value={value} onValueChange={(v) => handleChange(v ?? "unassigned")} disabled={pending}>
      <SelectTrigger className="w-56">
        <SelectValue>
          {(v) =>
            v === "unassigned" ? "Unassigned" : (staff.find((s) => s.id === v)?.name ?? "Unassigned")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {staff.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AttachmentLink({ path, fileName }: { path: string; fileName: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await getAttachmentUrl(path);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Signed URL is short-lived and minted on demand; the bucket is private.
    window.open(result.data, "_blank", "noopener,noreferrer");
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      {pending ? "Opening…" : fileName}
    </Button>
  );
}

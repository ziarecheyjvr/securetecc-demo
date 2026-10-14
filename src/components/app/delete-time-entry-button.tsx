"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteTimeEntry } from "@/app/(app)/time-entries/actions";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteTimeEntryButton({ id, isBilled }: { id: string; isBilled?: boolean }) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    const message = isBilled
      ? "This entry has already been invoiced. Deleting it will NOT update the invoice total — continue?"
      : "Delete this time entry? This cannot be undone.";
    if (!confirm(message)) return;
    setPending(true);
    const result = await deleteTimeEntry(id);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Time entry deleted");
  }

  return (
    <Button variant="ghost" size="icon-sm" disabled={pending} onClick={handleDelete}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

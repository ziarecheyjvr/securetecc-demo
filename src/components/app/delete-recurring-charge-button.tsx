"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteRecurringCharge } from "@/app/(app)/clients/recurring-charge-actions";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteRecurringChargeButton({
  id,
  clientId,
}: {
  id: string;
  clientId: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this recurring charge? This cannot be undone.")) return;
    setPending(true);
    // A charge that's been billed is FK-protected by its invoice snapshot rows;
    // the action turns that into a "mark it inactive instead" message.
    const result = await deleteRecurringCharge(id, clientId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Recurring charge deleted");
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      onClick={handleDelete}
      aria-label="Delete charge"
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

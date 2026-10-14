"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteBusinessExpense } from "@/app/(app)/settings/expenses/actions";

export function DeleteBusinessExpenseButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={`Delete ${name}`}
      onClick={async () => {
        // Marking it inactive keeps it in past reports; deleting removes it
        // from them, which is why this asks.
        if (!confirm(`Delete "${name}"? Past reports will stop counting it.`)) return;
        setPending(true);
        const result = await deleteBusinessExpense(id);
        setPending(false);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Cost deleted");
        router.refresh();
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

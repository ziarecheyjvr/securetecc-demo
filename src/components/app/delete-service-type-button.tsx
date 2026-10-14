"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteServiceType } from "@/app/(app)/settings/service-types/actions";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteServiceTypeButton({ id, code }: { id: string; code: string }) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete service type "${code}"? This cannot be undone.`)) return;
    setPending(true);
    const result = await deleteServiceType(id);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Service type deleted");
  }

  return (
    <Button variant="ghost" size="icon-sm" disabled={pending} onClick={handleDelete}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

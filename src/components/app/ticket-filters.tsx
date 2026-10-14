"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "Open", label: "Open" },
  { value: "New", label: "New" },
  { value: "InProgress", label: "In progress" },
  { value: "WaitingOnClient", label: "Waiting on client" },
  { value: "Completed", label: "Completed" },
  { value: "Closed", label: "Closed" },
  { value: "All", label: "All statuses" },
];

const URGENCY_OPTIONS = [
  { value: "All", label: "Any urgency" },
  { value: "Emergency", label: "Emergency" },
  { value: "Critical", label: "Critical" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

export function TicketFilters({
  status,
  urgency,
  q,
}: {
  status: string;
  urgency: string;
  q: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);

  function navigate(nextStatus: string, nextUrgency: string, nextQ = search) {
    const params = new URLSearchParams({ status: nextStatus, urgency: nextUrgency });
    if (nextQ.trim()) params.set("q", nextQ.trim());
    router.push(`/tickets?${params.toString()}`);
  }

  // Debounced so typing doesn't fire a navigation per keystroke. Skipped when
  // the box already matches the URL, which is the case on first render and
  // after a navigation completes.
  useEffect(() => {
    if (search.trim() === q.trim()) return;
    const timer = setTimeout(() => navigate(status, urgency, search), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is stable enough here
  }, [search]);

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search ticket #, company, contact…"
        aria-label="Search tickets"
        className="h-9 w-[260px]"
      />
      <Select value={status} onValueChange={(v) => v && navigate(v, urgency)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue>
            {(value) => STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "Status"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={urgency} onValueChange={(v) => v && navigate(status, v)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue>
            {(value) => URGENCY_OPTIONS.find((o) => o.value === value)?.label ?? "Urgency"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {URGENCY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATE_RANGE_PRESET_LABELS, DATE_RANGE_PRESETS, type DateRangePreset } from "@/lib/date-range";

type ClientOption = { id: string; name: string };

/**
 * Client and period filters, shared by Time entries and Reimbursable charges.
 *
 * `basePath` exists because the two are now separate routes rather than one
 * page with a Type dropdown. The dropdown is gone: the tab above already says
 * which list you are looking at, and having both a tab and a select that set
 * the same thing meant two controls disagreeing about the same state.
 */
export function TimeEntryFilters({
  basePath = "/time-entries",
  clientId,
  range,
  start,
  end,
  clients,
  staff,
  performedBy = "all",
}: {
  basePath?: string;
  clientId: string; // "all" or a client id
  range: DateRangePreset;
  start: string; // yyyy-mm-dd, only meaningful when range === "custom"
  end: string;
  clients: ClientOption[];
  /** Omitted on the pages that have no performedBy to filter by. */
  staff?: { id: string; name: string }[];
  performedBy?: string; // "all" or a user id
}) {
  const router = useRouter();

  function navigate(
    next: Partial<{
      clientId: string;
      range: DateRangePreset;
      start: string;
      end: string;
      performedBy: string;
    }>,
  ) {
    const merged = { clientId, range, start, end, performedBy, ...next };
    const params = new URLSearchParams();
    if (merged.clientId !== "all") params.set("client", merged.clientId);
    if (merged.performedBy !== "all") params.set("performedBy", merged.performedBy);
    if (merged.range !== "all") params.set("range", merged.range);
    if (merged.range === "custom") {
      if (merged.start) params.set("start", merged.start);
      if (merged.end) params.set("end", merged.end);
    }
    const qs = params.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  return (
    // Two per row on a phone, the original inline row from `sm` up. The
    // fixed widths below are what a filter bar wants on a desktop and what
    // leaves half a phone screen empty beside a 190px control.
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Client</Label>
        <Select value={clientId} onValueChange={(v) => v && navigate({ clientId: v })}>
          <SelectTrigger className="w-full sm:w-[190px]">
            <SelectValue>
              {(value) =>
                value === "all" ? "All clients" : clients.find((c) => c.id === value)?.name ?? "All clients"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Period</Label>
        <Select value={range} onValueChange={(v) => v && navigate({ range: v as DateRangePreset })}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue>{(value) => DATE_RANGE_PRESET_LABELS[value as DateRangePreset]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGE_PRESETS.map((value) => (
              <SelectItem key={value} value={value}>
                {DATE_RANGE_PRESET_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {staff && staff.length > 1 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Performed by</Label>
          <Select value={performedBy} onValueChange={(v) => v && navigate({ performedBy: v })}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue>
                {(value) =>
                  value === "all" ? "Anyone" : (staff.find((s) => s.id === value)?.name ?? "Anyone")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              {staff.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {range === "custom" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Start date</Label>
            <Input
              type="date"
              value={start}
              onChange={(e) => navigate({ start: e.target.value })}
              className="w-full sm:w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">End date</Label>
            <Input
              type="date"
              value={end}
              onChange={(e) => navigate({ end: e.target.value })}
              className="w-full sm:w-[160px]"
            />
          </div>
        </>
      )}
    </div>
  );
}

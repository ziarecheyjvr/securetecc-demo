"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { saveAvailability } from "@/app/(app)/team/actions";
import { TEAM_TIME_ZONES, WEEKDAY_LABELS, toTimeInputValue } from "@/lib/timezones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Block = {
  weekday: number;
  start: string;
  end: string;
  label: string | null;
  kind: "Work" | "Commitment";
};

/**
 * Someone's working week, edited in their own clock.
 *
 * Times are entered as they read where the person actually is. The
 * conversions on the page behind this are a display concern -- asking someone
 * to enter their hours in another country's time is how a rota ends up wrong
 * twice a year.
 */
export function AvailabilityEditor({
  userId,
  name,
  timeZone,
  jobTitle,
  blocks: initial,
  offlineAfter: initialOfflineAfter,
  availabilityNote: initialNote,
  estimatedWeeklyHours: initialEstimate,
  trigger,
}: {
  userId: string;
  name: string;
  timeZone: string;
  jobTitle: string | null;
  offlineAfter: string | null;
  availabilityNote: string | null;
  estimatedWeeklyHours: number | null;
  blocks: {
    weekday: number;
    startMinutes: number;
    endMinutes: number;
    label: string | null;
    kind?: "Work" | "Commitment";
  }[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zone, setZone] = useState(timeZone);
  const [title, setTitle] = useState(jobTitle ?? "");
  const [offline, setOffline] = useState(initialOfflineAfter ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const [estimate, setEstimate] = useState(initialEstimate == null ? "" : String(initialEstimate));
  const [blocks, setBlocks] = useState<Block[]>(
    initial.map((b) => ({
      weekday: b.weekday,
      start: toTimeInputValue(b.startMinutes),
      end: toTimeInputValue(b.endMinutes),
      label: b.label,
      kind: b.kind ?? "Work",
    })),
  );

  function addBlock(weekday: number) {
    setBlocks((b) => [...b, { weekday, start: "09:00", end: "17:00", label: null, kind: "Work" }]);
  }

  function update(index: number, patch: Partial<Block>) {
    setBlocks((b) => b.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /** Copies the first weekday's blocks across Monday to Friday. */
  function applyToWeekdays() {
    const source = blocks.filter((b) => b.weekday >= 1 && b.weekday <= 5);
    const template = source[0];
    if (!template) {
      toast.error("Add one weekday first, then copy it across.");
      return;
    }
    setBlocks([
      ...blocks.filter((b) => b.weekday === 0 || b.weekday === 6),
      ...[1, 2, 3, 4, 5].map((weekday) => ({ ...template, weekday })),
    ]);
  }

  async function save() {
    setSaving(true);
    const result = await saveAvailability({
      userId,
      timeZone: zone,
      jobTitle: title.trim() || null,
      offlineAfter: offline || null,
      availabilityNote: note.trim() || null,
      estimatedWeeklyHours: estimate.trim() === "" ? null : Number(estimate),
      blocks,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${name}'s hours saved`);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name}&apos;s hours</DialogTitle>
          <DialogDescription>
            Enter the times as they read on {name.split(" ")[0]}&apos;s own clock. The Team page
            converts them for everyone else, and re-converts when any country changes its clocks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Works from</Label>
              <Select value={zone} onValueChange={(v) => setZone(v ?? zone)}>
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      TEAM_TIME_ZONES.find((z) => z.id === value)?.label ?? String(value)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TEAM_TIME_ZONES.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Role</Label>
              <Input
                id="jobTitle"
                value={title}
                placeholder="IT Support, VA, Developer…"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            {WEEKDAY_LABELS.map((label, weekday) => {
              const rows = blocks
                .map((b, index) => ({ ...b, index }))
                .filter((b) => b.weekday === weekday);

              return (
                <div key={weekday} className="flex flex-wrap items-start gap-3 border-b pb-3">
                  <span className="w-24 shrink-0 pt-1.5 text-sm font-medium">{label}</span>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {rows.length === 0 && (
                      <span className="pt-1.5 text-sm text-muted-foreground">Not working</span>
                    )}
                    {rows.map((row) => (
                      <div key={row.index} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          value={row.start}
                          onChange={(e) => update(row.index, { start: e.target.value })}
                          className="h-8 w-[7.5rem]"
                          aria-label={`${label} start`}
                        />
                        <span className="text-sm text-muted-foreground">to</span>
                        <Input
                          type="time"
                          value={row.end}
                          onChange={(e) => update(row.index, { end: e.target.value })}
                          className="h-8 w-[7.5rem]"
                          aria-label={`${label} end`}
                        />
                        <Select
                          value={row.kind}
                          onValueChange={(v) =>
                            update(row.index, { kind: (v as Block["kind"]) ?? "Work" })
                          }
                        >
                          <SelectTrigger className="h-8 w-44" aria-label={`${label} type`}>
                            <SelectValue>
                              {(value) =>
                                value === "Commitment" ? "Other" : "SecureTECC work"
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Work">SecureTECC work</SelectItem>
                            <SelectItem value="Commitment">Other — not SecureTECC</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={row.label ?? ""}
                          onChange={(e) => update(row.index, { label: e.target.value || null })}
                          placeholder={row.kind === "Commitment" ? "BBZ/Other…" : "Label (optional)"}
                          className="h-8 w-40"
                          aria-label={`${label} label`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setBlocks((b) => b.filter((_, i) => i !== row.index))}
                          aria-label={`Remove ${label} block`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 px-2"
                    onClick={() => addBlock(weekday)}
                    aria-label={`Add hours on ${label}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="offlineAfter">Usually offline after</Label>
              <Input
                id="offlineAfter"
                type="time"
                value={offline}
                onChange={(e) => setOffline(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Not a working hour and never counted as one. It tells someone fifteen hours away
                whether a message now will wake you.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="availabilityNote">Note</Label>
              <Input
                id="availabilityNote"
                value={note}
                placeholder="Flexible outside core hours"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedWeeklyHours">Typical SecureTECC hours a week</Label>
              <Input
                id="estimatedWeeklyHours"
                type="number"
                min="0"
                max="80"
                value={estimate}
                placeholder="—"
                onChange={(e) => setEstimate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                For work that happens around the blocks rather than inside them. Shown beside the
                booked total; it never changes the calendar.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            An end time earlier than its start is treated as an overnight shift — 10:00 PM to
            6:00 AM is eight hours, not minus sixteen.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={applyToWeekdays}>
            Copy the first weekday to Mon–Fri
          </Button>
          <span className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save hours"}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

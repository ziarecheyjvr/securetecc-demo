"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff, X } from "lucide-react";
import { addAvailabilityException, deleteAvailabilityException } from "@/app/(app)/team/actions";
import { EXCEPTION_KINDS, EXCEPTION_KIND_LABELS } from "@/lib/validations/availability";
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

type Kind = (typeof EXCEPTION_KINDS)[number];

export type ExceptionItem = { id: string; date: string; dateLabel: string; description: string };

/**
 * One-off changes to someone's usual week: leave, a blocked afternoon, a day
 * on different hours. Listed under their hours; editable by them or an admin.
 */
export function AvailabilityExceptions({
  userId,
  name,
  zoneAbbr,
  today,
  items,
  canEdit,
}: {
  userId: string;
  name: string;
  zoneAbbr: string;
  /** Today in the person's zone, "YYYY-MM-DD" -- the date picker's default. */
  today: string;
  items: ExceptionItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>("Leave");
  const [date, setDate] = useState(today);
  const [through, setThrough] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  const needsTimes = kind === "DifferentHours" || kind === "Blocked";
  const allowsTimes = needsTimes || kind === "Unavailable";
  const multiDay = kind === "Leave" || (kind === "Unavailable" && !start && !end);

  async function save() {
    setSaving(true);
    const result = await addAvailabilityException({
      userId,
      date,
      through: multiDay && through ? through : null,
      kind,
      start: allowsTimes && start ? start : null,
      end: allowsTimes && end ? end : null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Added");
    setOpen(false);
    setThrough("");
    setStart("");
    setEnd("");
    setNote("");
    router.refresh();
  }

  async function remove(id: string) {
    const result = await deleteAvailabilityException(id);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  if (!canEdit && items.length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Changes coming up</p>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button variant="ghost" size="sm">
                  <CalendarOff className="mr-1 h-3.5 w-3.5" /> Time off / change
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Change {name.split(" ")[0]}&apos;s hours</DialogTitle>
                <DialogDescription>
                  A one-off change to the usual week. Times are in {zoneAbbr}, {name.split(" ")[0]}&apos;s
                  own time.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>What&apos;s changing</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{EXCEPTION_KIND_LABELS[kind]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {EXCEPTION_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {EXCEPTION_KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="exc-date">{multiDay ? "From" : "Date"}</Label>
                    <Input id="exc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  {multiDay && (
                    <div className="space-y-1.5">
                      <Label htmlFor="exc-through">Through (optional)</Label>
                      <Input
                        id="exc-through"
                        type="date"
                        value={through}
                        min={date}
                        onChange={(e) => setThrough(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {allowsTimes && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="exc-start">Start{needsTimes ? "" : " (optional)"}</Label>
                      <Input id="exc-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="exc-end">End{needsTimes ? "" : " (optional)"}</Label>
                      <Input id="exc-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                    </div>
                    {kind === "Unavailable" && (
                      <p className="col-span-2 text-xs text-muted-foreground">
                        Leave the times empty for the whole day.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="exc-note">Note (optional)</Label>
                  <Input
                    id="exc-note"
                    value={note}
                    maxLength={120}
                    placeholder={kind === "Blocked" ? "e.g. Sergent M365 cutover" : "e.g. Family event"}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving || !date || (needsTimes && (!start || !end))}>
                  {saving ? "Saving…" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None — the usual hours apply.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline gap-2 text-sm">
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{item.dateLabel}</span>
              <span className="min-w-0 flex-1">{item.description}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${item.description} on ${item.dateLabel}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

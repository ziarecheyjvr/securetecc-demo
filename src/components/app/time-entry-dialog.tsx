"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  timeEntryFormSchema,
  type TimeEntryFormValues,
  BILLABLE_STATUS_LABELS,
} from "@/lib/validations/time-entry";
import { createTimeEntry, updateTimeEntry } from "@/app/(app)/time-entries/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type ClientOption = { id: string; name: string; shortName: string; isInternal?: boolean };
type ServiceTypeOption = {
  id: string;
  code: string;
  label: string;
  billingMinimumHours: number;
  rateOverride: number | null;
};

export function TimeEntryDialog({
  entryId,
  defaultValues,
  clients,
  serviceTypes,
  staff,
  projects = [],
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  entryId?: string;
  defaultValues?: Partial<TimeEntryFormValues>;
  clients: ClientOption[];
  serviceTypes: ServiceTypeOption[];
  /** Everyone the work could be attributed to. Empty hides the field. */
  staff?: { id: string; name: string }[];
  /** Projects already used, offered as suggestions for the chosen client. */
  projects?: { clientId: string; project: string }[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntryFormSchema),
    defaultValues: {
      clientId: "",
      serviceTypeId: "",
      date: new Date().toISOString().slice(0, 10),
      durationHours: 1,
      description: "",
      billableStatus: "Billable",
      rateOverride: null,
      travelMinutes: null,
      performedByUserId: null,
      project: null,
      ...defaultValues,
    },
  });

  async function onSubmit(values: TimeEntryFormValues) {
    setSubmitting(true);
    const result = entryId
      ? await updateTimeEntry(entryId, values)
      : await createTimeEntry(values);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(entryId ? "Time entry updated" : "Time entry logged");
    setOpen(false);
    if (!entryId) reset();
  }

  const clientId = watch("clientId");
  const serviceTypeId = watch("serviceTypeId");
  const billableStatus = watch("billableStatus");
  const performedByUserId = watch("performedByUserId");
  const selectedServiceType = serviceTypes.find((st) => st.id === serviceTypeId);
  const selectedClient = clients.find((c) => c.id === clientId);
  const projectSuggestions = [
    ...new Set(projects.filter((p) => p.clientId === clientId).map((p) => p.project)),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger as React.ReactElement} />}
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{entryId ? "Edit time entry" : "Log time"}</DialogTitle>
            <DialogDescription>
              Selecting a service type applies its billing minimum automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={(v) => setValue("clientId", v ?? "")}>
                  <SelectTrigger>
                    {/* base-ui renders the raw value (a uuid) without this mapper */}
                    <SelectValue placeholder="Select client">
                      {(value) => clients.find((c) => c.id === value)?.name ?? "Select client"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.clientId && (
                  <p className="text-xs text-destructive">{errors.clientId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" {...register("date")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Service type</Label>
              <Select
                value={serviceTypeId}
                onValueChange={(v) => setValue("serviceTypeId", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service type">
                    {(value) => {
                      const st = serviceTypes.find((s) => s.id === value);
                      return st ? `${st.code} — ${st.label}` : "Select service type";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.code} — {st.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.serviceTypeId && (
                <p className="text-xs text-destructive">{errors.serviceTypeId.message}</p>
              )}
              {selectedServiceType && (
                <p className="text-xs text-muted-foreground">
                  {selectedServiceType.billingMinimumHours}hr minimum
                  {selectedServiceType.rateOverride
                    ? ` · billed at $${selectedServiceType.rateOverride}/hr`
                    : " · billed at client's standard rate"}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="durationHours">Hours</Label>
                <Input
                  id="durationHours"
                  type="number"
                  step="0.25"
                  {...register("durationHours", { valueAsNumber: true })}
                />
                {errors.durationHours && (
                  <p className="text-xs text-destructive">{errors.durationHours.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Billable status</Label>
                <Select
                  value={billableStatus}
                  onValueChange={(v) =>
                    setValue("billableStatus", v as TimeEntryFormValues["billableStatus"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(value) => BILLABLE_STATUS_LABELS[value as TimeEntryFormValues["billableStatus"]]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BILLABLE_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {staff && staff.length > 1 && (
              <div className="space-y-2">
                <Label>Performed by</Label>
                <Select
                  value={performedByUserId ?? ""}
                  onValueChange={(v) => setValue("performedByUserId", v || null)}
                >
                  <SelectTrigger>
                    {/* base-ui renders the raw value (a uuid) without this mapper */}
                    <SelectValue placeholder="Me">
                      {(value) => staff.find((s) => s.id === value)?.name ?? "Me"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Who actually did the work — not always who typed it in.
                </p>
              </div>
            )}

            {/* Both optional and both deliberately below the main fields:
                the usual entry needs neither, and putting them first would
                suggest a rate has to be chosen every time. */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rateOverride">Rate for this job ($/hr)</Label>
                <Input
                  id="rateOverride"
                  type="number"
                  step="0.01"
                  placeholder="Usual rate"
                  {...register("rateOverride", {
                    setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
                  })}
                />
                {errors.rateOverride && (
                  <p className="text-xs text-destructive">{errors.rateOverride.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="travelMinutes">Travel (minutes, one way)</Label>
                <Input
                  id="travelMinutes"
                  type="number"
                  step="5"
                  min="0"
                  placeholder="—"
                  {...register("travelMinutes", {
                    setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  On-site work only. Billed one way inside the service area, both ways outside
                  it — the client&apos;s record decides which.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project">Project (optional)</Label>
              <Input
                id="project"
                list="project-suggestions"
                placeholder="e.g. CMMC Level 1, M365 migration"
                autoComplete="off"
                {...register("project", { setValueAs: (v) => (v === "" || v == null ? null : String(v)) })}
              />
              <datalist id="project-suggestions">
                {projectSuggestions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Splits one client&apos;s work into separate jobs without inventing extra clients.
              </p>
            </div>

            {selectedClient?.isInternal && (
              <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                {selectedClient.name} is SecureTECC&apos;s own work, so this entry is saved as
                non-billable whatever the status above says. Work that should be billed to a client
                belongs under that client.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={3} {...register("description")} />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Mic, Sparkles, Square } from "lucide-react";
import {
  taskFormSchema,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskFormValues,
} from "@/lib/validations/task";
import { createTask, updateTask } from "@/app/(app)/tasks/actions";
import { parseTaskVoiceNote } from "@/app/(app)/tasks/ai-actions";
import { LISTENING_PLACEHOLDER, useDictation } from "@/lib/hooks/use-dictation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

export type StaffOption = { id: string; name: string };

const EXAMPLES = [
  "Get Zia to reconcile the July invoices by Friday, high priority",
  "Ian needs to chase the PCC network quote, start Monday",
  "Remind me to review the Sergent migration doc end of the month",
];

/**
 * Create or edit a task.
 *
 * A new task opens on the dictation panel rather than the form. Speaking is
 * the fast path -- "get Zia to reconcile the July invoices by Friday" is one
 * sentence and six fields -- and the parse never saves anything: it fills the
 * form, which is then reviewed and submitted by hand. Typing is one click
 * away for anyone who would rather.
 */
export function TaskDialog({
  taskId,
  defaultValues,
  staff,
  selfUserId,
  trigger,
}: {
  taskId?: string;
  defaultValues?: Partial<TaskFormValues>;
  staff: StaffOption[];
  /** The signed-in user, so "assign to me" needs no extra lookup. */
  selfUserId: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Editing goes straight to the form: the task already exists, and there is
  // nothing to dictate.
  const [step, setStep] = useState<"dictate" | "form">(taskId ? "form" : "dictate");
  const [parsing, setParsing] = useState(false);
  const [reviewNote, setReviewNote] = useState<string | null>(null);

  const dictation = useDictation({
    onUnsupported: () => toast.error("Voice input needs Chrome or Safari."),
  });

  const emptyTask: TaskFormValues = {
    title: "",
    description: null,
    priority: "Medium",
    startDate: null,
    dueDate: null,
    assignedToUserId: "",
    additionalAssigneeIds: [],
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: { ...emptyTask, ...defaultValues },
  });

  function closeAndReset(next: boolean) {
    setOpen(next);
    if (next) return;
    dictation.reset();
    setReviewNote(null);
    setStep(taskId ? "form" : "dictate");
    if (!taskId) reset(emptyTask);
  }

  async function handleParse() {
    if (!dictation.hasSpeech) {
      toast.error("Record or type the note first.");
      return;
    }
    setParsing(true);
    const result = await parseTaskVoiceNote(dictation.transcript.trim());
    setParsing(false);

    if (!result.ok) {
      // Never discard the dictation -- saying it again is the expensive part,
      // and a parse failure says nothing about whether the note was good.
      // Drop the raw text into the description and let it be finished by hand.
      toast.error(`${result.error} Your note was kept — finish it by hand.`);
      reset({ ...emptyTask, description: dictation.transcript.trim() });
      setReviewNote(
        "AI parsing failed, so nothing was filled in. Your note is in the details — write " +
          "the title and choose who it's for.",
      );
      setStep("form");
      return;
    }

    reset({ ...emptyTask, ...result.values });
    setReviewNote(result.warning ?? "Drafted from your note. Check it before creating the task.");
    setStep("form");
  }

  async function onSubmit(values: TaskFormValues) {
    setSubmitting(true);
    const result = taskId ? await updateTask(taskId, values) : await createTask(values);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.warning) toast.warning(result.warning);
    else toast.success(taskId ? "Task updated" : "Task created — the assignee has been emailed.");

    closeAndReset(false);
    router.refresh();
  }

  const assignedToUserId = watch("assignedToUserId");
  const additionalAssigneeIds = watch("additionalAssigneeIds");
  const priority = watch("priority");

  /** Anyone can be added alongside the primary, except the primary. */
  function toggleAlso(userId: string) {
    const current = additionalAssigneeIds ?? [];
    setValue(
      "additionalAssigneeIds",
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
      { shouldDirty: true },
    );
  }

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{taskId ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {step === "dictate"
              ? "Say it the way you'd say it out loud. Nothing is saved until you review it."
              : "Check the details, then create the task."}
          </DialogDescription>
        </DialogHeader>

        {step === "dictate" ? (
          <div className="space-y-4 py-2">
            <Button
              type="button"
              onClick={dictation.toggle}
              variant={dictation.isRecording ? "destructive" : "default"}
              className="h-14 w-full text-base"
            >
              {dictation.isRecording ? (
                <>
                  <Square className="mr-2 h-4 w-4" /> Stop recording
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-4 w-4" /> Tap to speak
                </>
              )}
            </Button>

            <div className="space-y-2">
              <Label htmlFor="transcript">Note</Label>
              <Textarea
                id="transcript"
                rows={4}
                value={dictation.transcript === LISTENING_PLACEHOLDER ? "" : dictation.transcript}
                placeholder={
                  dictation.isRecording ? "Listening…" : "Or type the note here instead."
                }
                onChange={(e) => dictation.setTranscript(e.target.value)}
              />
            </div>

            <div className="rounded-md border-l-2 border-accent bg-accent/5 px-3 py-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-accent">
                For example
              </p>
              {EXAMPLES.map((line) => (
                <p key={line} className="text-xs text-muted-foreground">
                  &ldquo;{line}&rdquo;
                </p>
              ))}
            </div>

            {dictation.supported === false && (
              <p className="text-xs text-muted-foreground">
                This browser has no speech recognition — type the note above and it will still be
                drafted for you.
              </p>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep("form")}>
                Skip — type it out
              </Button>
              <Button type="button" onClick={handleParse} disabled={parsing || !dictation.hasSpeech}>
                <Sparkles className="mr-1 h-4 w-4" />
                {parsing ? "Drafting…" : "Draft the task"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-2">
              {reviewNote && (
                <p className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs">
                  {reviewNote}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Task</Label>
                <Input id="title" placeholder="Reconcile the July invoices" {...register("title")} />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Details</Label>
                <Textarea
                  id="description"
                  rows={4}
                  placeholder="What needs doing, and anything they need to know."
                  {...register("description", { setValueAs: (v) => (v === "" ? null : v) })}
                />
                {errors.description && (
                  <p className="text-xs text-destructive">{errors.description.message}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Assign to</Label>
                    {assignedToUserId !== selfUserId && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setValue("assignedToUserId", selfUserId)}
                      >
                        Assign to me
                      </button>
                    )}
                  </div>
                  <Select
                    value={assignedToUserId}
                    onValueChange={(v) => setValue("assignedToUserId", v ?? "")}
                  >
                    <SelectTrigger>
                      {/* base-ui renders the raw value (a uuid) without this mapper */}
                      <SelectValue placeholder="Choose someone">
                        {(value) => staff.find((s) => s.id === value)?.name ?? "Choose someone"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.id === selfUserId ? " (me)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.assignedToUserId && (
                    <p className="text-xs text-destructive">{errors.assignedToUserId.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={priority}
                    onValueChange={(v) =>
                      setValue("priority", (v ?? "Medium") as TaskFormValues["priority"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(value) =>
                          TASK_PRIORITY_LABELS[value as TaskFormValues["priority"]] ?? "Medium"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {TASK_PRIORITY_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* A task can belong to more than one person -- work involving
                  both Zia and Ian is one task with two owners, not two tasks
                  that drift apart. Everyone ticked is emailed, and everyone
                  ticked can move it. */}
              {staff.filter((s) => s.id !== assignedToUserId).length > 0 && (
                <div className="space-y-2">
                  <Label>Also assigned to</Label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border p-3">
                    {staff
                      .filter((s) => s.id !== assignedToUserId)
                      .map((person) => (
                        <label
                          key={person.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={(additionalAssigneeIds ?? []).includes(person.id)}
                            onCheckedChange={() => toggleAlso(person.id)}
                          />
                          {person.name}
                        </label>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Optional. Everyone assigned is emailed and can move the task.
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    {...register("startDate", { setValueAs: (v) => (v === "" ? null : v) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    {...register("dueDate", { setValueAs: (v) => (v === "" ? null : v) })}
                  />
                  {errors.dueDate && (
                    <p className="text-xs text-destructive">{errors.dueDate.message}</p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              {!taskId ? (
                <Button type="button" variant="ghost" onClick={() => setStep("dictate")}>
                  Back to dictation
                </Button>
              ) : (
                <span />
              )}
              <span className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => closeAndReset(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : taskId ? "Save changes" : "Create task"}
                </Button>
              </span>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

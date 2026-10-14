"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/validations/task";
import { deleteTask, updateTaskStatus } from "@/app/(app)/tasks/actions";
import { TaskDialog, type StaffOption } from "@/components/app/task-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriorityValue;
  status: TaskStatusValue;
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string;
  assigneeName: string;
  /** Everyone the task belongs to, primary first. */
  assignees: { id: string; name: string }[];
  createdByName: string;
};

const PRIORITY_CLASS: Record<TaskPriorityValue, string> = {
  Low: "text-muted-foreground",
  Medium: "text-accent",
  High: "text-amber-500",
  Urgent: "text-destructive",
};

/** "2026-09-05" -> "5 Sep". Split rather than parsed: a date-only string put
 *  through `new Date()` is read as UTC midnight, which is the previous day in
 *  Pacific -- the bug that shifted every imported time entry. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(d)} ${months[Number(m) - 1]}`;
}

export function TaskBoard({
  tasks,
  staff,
  selfUserId,
  canDelegate,
  today,
}: {
  tasks: BoardTask[];
  staff: StaffOption[];
  selfUserId: string;
  canDelegate: boolean;
  /** Today in Pacific, resolved on the server so overdue is judged in the
   *  org's timezone rather than the viewer's. */
  today: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((t) => t.status === status);
        return (
          <div key={status} className="rounded-lg border bg-card/40 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {TASK_STATUS_LABELS[status]}
              </h2>
              <span className="text-xs text-muted-foreground">{column.length}</span>
            </div>
            <div className="space-y-2">
              {column.length === 0 ? (
                <p className="px-1 py-4 text-xs text-muted-foreground">Nothing here.</p>
              ) : (
                column.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    staff={staff}
                    selfUserId={selfUserId}
                    canDelegate={canDelegate}
                    today={today}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  staff,
  selfUserId,
  canDelegate,
  today,
}: {
  task: BoardTask;
  staff: StaffOption[];
  selfUserId: string;
  canDelegate: boolean;
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Only the assignee and the delegator may move a task -- the same rule the
  // action enforces. Showing a control that always errors is worse than not
  // showing it.
  const canMove = canDelegate || task.assignees.some((a) => a.id === selfUserId);
  const overdue =
    task.dueDate !== null && task.dueDate < today && task.status !== "Completed";

  async function changeStatus(next: TaskStatusValue) {
    if (next === task.status) return;
    setBusy(true);
    const result = await updateTaskStatus(task.id, next);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (next === "ForReview") toast.success("Marked for review — the delegator has been emailed.");
    else if (next === "Completed") toast.success("Marked complete — the delegator has been emailed.");
    else toast.success(`Moved to ${TASK_STATUS_LABELS[next]}`);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setBusy(true);
    const result = await deleteTask(task.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Task deleted");
    router.refresh();
  }

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug">{task.title}</p>
        <span
          className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${PRIORITY_CLASS[task.priority]}`}
        >
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      {task.description && (
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
          {task.description}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {task.assignees.map((a) => (
          <Badge key={a.id} variant="outline" className="font-normal">
            {a.id === selfUserId ? "You" : a.name}
          </Badge>
        ))}
        {task.dueDate && (
          <span className={overdue ? "text-destructive" : undefined}>
            {overdue ? "Overdue " : "Due "}
            {shortDate(task.dueDate)}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1">
        <Select
          value={task.status}
          onValueChange={(v) => changeStatus((v ?? task.status) as TaskStatusValue)}
          disabled={!canMove || busy}
        >
          <SelectTrigger className="h-8 flex-1 text-xs" aria-label={`Status of ${task.title}`}>
            <SelectValue>
              {(value) => TASK_STATUS_LABELS[value as TaskStatusValue] ?? "Status"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canDelegate && (
          <>
            <TaskDialog
              taskId={task.id}
              staff={staff}
              selfUserId={selfUserId}
              defaultValues={{
                title: task.title,
                description: task.description,
                priority: task.priority,
                startDate: task.startDate,
                dueDate: task.dueDate,
                assignedToUserId: task.assigneeId,
                additionalAssigneeIds: task.assignees
                  .filter((a) => a.id !== task.assigneeId)
                  .map((a) => a.id),
              }}
              trigger={
                <Button variant="ghost" size="sm" className="h-8 px-2" aria-label="Edit task">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={remove}
              disabled={busy}
              aria-label="Delete task"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

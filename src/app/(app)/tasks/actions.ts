"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import {
  notifyTaskAssigned,
  notifyTaskCompleted,
  notifyTaskForReview,
} from "@/lib/email/notify";
import {
  taskFormSchema,
  taskStatusSchema,
  type TaskFormValues,
  type TaskStatusValue,
} from "@/lib/validations/task";

export type ActionResult = { ok: true; warning?: string } | { ok: false; error: string };

/**
 * yyyy-mm-dd -> the Date a @db.Date column stores.
 *
 * Constructed with Date.UTC from the parts rather than `new Date(str)`. Both
 * happen to give UTC midnight for this format, but the explicit form can't be
 * broken later by someone "helpfully" accepting another date format, and it
 * documents that the value is a calendar date with no time in it.
 */
function toDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Creates and assigns a task.
 *
 * Permission is checked here AND enforced by RLS. The check here exists to
 * give a readable error instead of a policy violation; the policy exists
 * because a check in application code is not a security boundary.
 */
export async function createTask(input: TaskFormValues): Promise<ActionResult> {
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireOrgContext();
  if (!appUser.canDelegateTasks) {
    return { ok: false, error: "You don't have permission to assign tasks." };
  }

  // The primary first, then anyone else, de-duplicated -- picking the primary
  // again in the extra list is an easy thing to do and should not create two
  // rows or two emails.
  const assigneeIds = [...new Set([data.assignedToUserId, ...data.additionalAssigneeIds])];

  let taskId: string;
  try {
    taskId = await withRLS(authUserId, async (tx) => {
      // Every assignee must be a real colleague in this org. RLS scopes the
      // lookup, so an id from another organisation simply isn't found.
      const found = await tx.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true },
      });
      if (found.length !== assigneeIds.length) {
        throw new Error("One of those people isn't in your organisation.");
      }

      const created = await tx.task.create({
        data: {
          organizationId: appUser.organizationId,
          title: data.title,
          description: data.description || null,
          priority: data.priority,
          startDate: toDateOnly(data.startDate),
          dueDate: toDateOnly(data.dueDate),
          assignedToUserId: data.assignedToUserId,
          createdByUserId: appUser.id,
        },
        select: { id: true },
      });

      // The primary is a membership row too, so "who is on this task" is one
      // question with one answer rather than a column ORed with a join.
      await tx.taskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId: created.id, userId })),
      });
      return created.id;
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't create the task." };
  }

  // After the transaction commits, never inside it: the task existing is the
  // real work, and a mail failure must not roll it back.
  const sent = await notifyTaskAssigned(taskId);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");

  if (!sent.ok && !sent.skipped) {
    return { ok: true, warning: `Task created, but the email didn't send: ${sent.error}` };
  }
  return { ok: true };
}

export async function updateTask(taskId: string, input: TaskFormValues): Promise<ActionResult> {
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireOrgContext();
  if (!appUser.canDelegateTasks) {
    return { ok: false, error: "You don't have permission to edit tasks." };
  }

  const assigneeIds = [...new Set([data.assignedToUserId, ...data.additionalAssigneeIds])];

  // Whether anyone NEW was put on this task. Only they are emailed -- telling
  // the existing assignees again because a due date moved is how people learn
  // to ignore the notification.
  let addedAnyone = false;
  try {
    addedAnyone = await withRLS(authUserId, async (tx) => {
      const before = await tx.task.findUnique({
        where: { id: taskId },
        select: { assignedToUserId: true, assignees: { select: { userId: true } } },
      });
      if (!before) throw new Error("Task not found.");
      const had = new Set(before.assignees.map((a) => a.userId));

      await tx.task.update({
        where: { id: taskId },
        data: {
          title: data.title,
          description: data.description || null,
          priority: data.priority,
          startDate: toDateOnly(data.startDate),
          dueDate: toDateOnly(data.dueDate),
          assignedToUserId: data.assignedToUserId,
        },
      });

      // Replace the membership wholesale: an edit is the full new set, and
      // reconciling additions against removals row by row is a bug waiting
      // for the day someone swaps both assignees at once.
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      await tx.taskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId, userId })),
      });

      return assigneeIds.some((id) => !had.has(id));
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't update the task." };
  }

  if (addedAnyone) await notifyTaskAssigned(taskId);
  revalidatePath("/tasks");
  return { ok: true };
}

/**
 * Moves a task between statuses.
 *
 * Separate from updateTask on purpose: this is the one write an assignee is
 * allowed to make, so keeping it its own action means the editable fields
 * never travel through a path they can call. RLS lets an assignee update
 * their own row; it cannot restrict WHICH columns, so that restriction lives
 * here -- and this action writes nothing but status.
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatusValue,
): Promise<ActionResult> {
  const parsed = taskStatusSchema.safeParse({ taskId, status });
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const { authUserId, appUser } = await requireOrgContext();

  // What the delegator needs to hear about: work waiting on them, and work
  // finished. Both only on the transition, never on a re-save of the same
  // status -- a second identical email is how people learn to ignore the
  // first.
  let transition: "ForReview" | "Completed" | null = null;
  try {
    transition = await withRLS(authUserId, async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: {
          assignedToUserId: true,
          status: true,
          completedAt: true,
          assignees: { select: { userId: true } },
        },
      });
      if (!task) throw new Error("Task not found.");
      // Anyone assigned may move it, not only the person it is filed under.
      const isAssigned =
        task.assignedToUserId === appUser.id ||
        task.assignees.some((a) => a.userId === appUser.id);
      if (!appUser.canDelegateTasks && !isAssigned) {
        throw new Error("You can only update tasks assigned to you.");
      }

      await tx.task.update({
        where: { id: taskId },
        data: {
          status,
          // Stamped the first time it completes and never overwritten, so
          // "finished on" survives a re-open and a second completion.
          completedAt:
            status === "Completed" ? (task.completedAt ?? new Date()) : task.completedAt,
        },
      });
      if (status === task.status) return null;
      if (status === "ForReview") return "ForReview" as const;
      if (status === "Completed") return "Completed" as const;
      return null;
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't update the status." };
  }

  if (transition === "ForReview") await notifyTaskForReview(taskId);
  if (transition === "Completed") await notifyTaskCompleted(taskId);
  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const { authUserId, appUser } = await requireOrgContext();
  if (!appUser.canDelegateTasks) {
    return { ok: false, error: "You don't have permission to delete tasks." };
  }

  try {
    await withRLS(authUserId, (tx) => tx.task.delete({ where: { id: taskId } }));
  } catch {
    return { ok: false, error: "Couldn't delete the task." };
  }
  revalidatePath("/tasks");
  return { ok: true };
}

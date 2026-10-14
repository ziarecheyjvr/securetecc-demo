import { Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { PACIFIC_TZ, pacificDayStart } from "@/lib/cron/pacific";
import { TaskBoard, type BoardTask } from "@/components/app/task-board";
import { TaskDialog } from "@/components/app/task-dialog";
import { Button } from "@/components/ui/button";

/**
 * The delegation board.
 *
 * Everyone reads everything — shared awareness is the point, and the split
 * that matters (only the delegator creates and assigns) is enforced by RLS in
 * supabase/migrations/0007_tasks.sql, not just by hiding buttons here.
 */
export default async function TasksPage() {
  const { appUser, authUserId } = await requireOrgContext();

  const [tasks, staff] = await withRLS(authUserId, (tx) =>
    Promise.all([
      tx.task.findMany({
        orderBy: [
          // Undated work sinks below anything with a deadline, and the most
          // urgent of the undated rises within it.
          { dueDate: { sort: "asc", nulls: "last" } },
          { priority: "desc" },
          { createdAt: "desc" },
        ],
        include: {
          assignedToUser: { select: { id: true, name: true } },
          assignees: { include: { user: { select: { id: true, name: true } } } },
          createdByUser: { select: { name: true } },
        },
      }),
      tx.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]),
  );

  const board: BoardTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    // Date-only columns, formatted with toISOString because they are stored
    // as UTC midnight — never through a locale formatter, which would shift
    // them a day.
    startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    assigneeId: t.assignedToUser.id,
    assigneeName: t.assignedToUser.name,
    // Every owner, primary first, so a card shows who the work belongs to
    // rather than only whose column it happens to sit in.
    assignees: [
      { id: t.assignedToUser.id, name: t.assignedToUser.name },
      ...t.assignees
        .filter((a) => a.userId !== t.assignedToUser.id)
        .map((a) => ({ id: a.user.id, name: a.user.name })),
    ],
    createdByName: t.createdByUser.name,
  }));

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(pacificDayStart());
  const mine = board.filter(
    (t) => t.assignees.some((a) => a.id === appUser.id) && t.status !== "Completed",
  ).length;
  const waiting = board.filter((t) => t.status === "ForReview").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            {appUser.canDelegateTasks
              ? "Delegate work to the team and track it through to done."
              : "What the team is working on, and who has what."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {mine === 0 ? "Nothing open assigned to you" : `${mine} open assigned to you`}
            {appUser.canDelegateTasks && waiting > 0 && ` · ${waiting} waiting on your review`}
          </p>
        </div>

        {appUser.canDelegateTasks && (
          <TaskDialog
            staff={staff}
            selfUserId={appUser.id}
            trigger={
              <Button>
                <Plus className="mr-1 h-4 w-4" /> New task
              </Button>
            }
          />
        )}
      </div>

      {board.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {appUser.canDelegateTasks
              ? "No tasks yet. Create one — you can dictate it and check the draft before it goes out."
              : "No tasks yet."}
          </p>
        </div>
      ) : (
        <TaskBoard
          tasks={board}
          staff={staff}
          selfUserId={appUser.id}
          canDelegate={appUser.canDelegateTasks}
          today={today}
        />
      )}
    </div>
  );
}

import { z } from "zod";

export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export const TASK_STATUSES = ["NotStarted", "InProgress", "ForReview", "Completed"] as const;

export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];
export type TaskStatusValue = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriorityValue, string> = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
  Urgent: "Urgent",
};

export const TASK_STATUS_LABELS: Record<TaskStatusValue, string> = {
  NotStarted: "Not started",
  InProgress: "In progress",
  ForReview: "For review",
  Completed: "Completed",
};

/**
 * Dates are date-only strings, validated as such and never parsed with
 * `new Date()` on the way in -- that reads yyyy-mm-dd as UTC midnight, which
 * is the previous day in Pacific. Same bug that shifted the digest window and
 * every imported time entry.
 */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .nullable();

export const taskFormSchema = z
  .object({
    title: z.string().trim().min(2, "Give the task a name").max(200, "That name is too long"),
    description: z.string().trim().max(5000, "That description is too long").nullable(),
    priority: z.enum(TASK_PRIORITIES),
    startDate: dateOnly,
    dueDate: dateOnly,
    assignedToUserId: z.string().min(1, "Choose who this is for"),
    /// Everyone else this is also for. The primary above is not repeated
    /// here; the action stores all of them together.
    ///
    /// No `.default([])`: a zod default makes the resolver's input type
    /// optional while its output type stays required, which
    /// useForm<TaskFormValues> cannot reconcile. The form supplies [].
    additionalAssigneeIds: z.array(z.string()),
  })
  .refine(
    (v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate,
    // ISO date strings compare correctly as strings, so this needs no parsing.
    { message: "The due date can't be before the start date", path: ["dueDate"] },
  );

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const taskStatusSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(TASK_STATUSES),
});

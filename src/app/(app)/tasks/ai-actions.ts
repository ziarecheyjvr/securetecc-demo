"use server";

import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { parseTaskWithGemini } from "@/lib/ai/task";
import { pacificDayStart, PACIFIC_TZ } from "@/lib/cron/pacific";
import { TASK_PRIORITIES, type TaskFormValues } from "@/lib/validations/task";

export type TaskParseResult =
  | {
      ok: true;
      values: Partial<TaskFormValues>;
      /** What the parse could not settle, shown above the review form. */
      warning?: string;
    }
  | { ok: false; error: string };

/**
 * Turns a dictated note into a DRAFT task for review.
 *
 * Writes nothing. Everything it produces is shown in the form first and has
 * to be confirmed -- a task that assigned itself to the wrong person and
 * appeared in their inbox before anyone read it would be worse than no
 * dictation at all.
 */
export async function parseTaskVoiceNote(rawInput: string): Promise<TaskParseResult> {
  if (!rawInput.trim()) return { ok: false, error: "Record or type the task first." };

  const { authUserId, appUser } = await requireOrgContext();
  if (!appUser.canDelegateTasks) {
    return { ok: false, error: "You don't have permission to create tasks." };
  }

  const staff = await withRLS(authUserId, (tx) =>
    tx.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  );

  let parsed;
  try {
    parsed = await parseTaskWithGemini({
      orgName: appUser.organization.name,
      rawInput,
      staff: staff.map((s) => ({ name: s.name, isSelf: s.id === appUser.id })),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI parsing failed." };
  }

  const title = (parsed.title ?? "").trim();
  if (!title) return { ok: false, error: "The AI couldn't find a task in that note." };

  const warnings: string[] = [];

  // The model is told to return a roster name verbatim, but a near-miss
  // ("Zia J", "Ian.") is likelier than a clean failure, so match forgivingly
  // and fall back to asking rather than assigning the wrong person.
  const spoken = parsed.assigneeName?.trim().toLowerCase() ?? "";
  const exact = staff.find((s) => s.name.toLowerCase() === spoken);
  // "Zia" for "Zia Javier" is the common return, so fall back to the first
  // name -- but only when exactly one person answers to it. Two Ians would
  // otherwise silently get the alphabetically first one.
  const byFirstName = staff.filter(
    (s) => s.name.toLowerCase().split(" ")[0] === spoken.split(" ")[0],
  );
  const assignee = spoken ? (exact ?? (byFirstName.length === 1 ? byFirstName[0] : undefined)) : undefined;

  if (spoken && !assignee) {
    warnings.push(`Couldn't match "${parsed.assigneeName}" to anyone — choose the assignee.`);
  } else if (!spoken) {
    warnings.push("Nobody was named in the note — choose who this is for.");
  }

  const priority = (TASK_PRIORITIES as readonly string[]).includes(parsed.priority)
    ? (parsed.priority as TaskFormValues["priority"])
    : "Medium";

  const startDate = normalizeDate(parsed.startDate);
  let dueDate = normalizeDate(parsed.dueDate);
  if (startDate && dueDate && startDate > dueDate) {
    // The form refuses this pair, and silently dropping the start date would
    // hide the mistake. Drop the due date and say so -- the start date is the
    // one the speaker is likelier to have stated explicitly.
    warnings.push("The dates came back out of order, so the due date was cleared. Set it again.");
    dueDate = null;
  }

  return {
    ok: true,
    warning: warnings.length ? warnings.join(" ") : undefined,
    values: {
      title: title.slice(0, 200),
      description: parsed.description?.trim() || null,
      priority,
      startDate,
      dueDate,
      assignedToUserId: assignee?.id ?? "",
    },
  };
}

/**
 * Keeps only a real yyyy-mm-dd, and never one in the past.
 *
 * A model asked for "next Friday" occasionally returns last Friday. A due
 * date already behind us is worse than none: it makes the task overdue the
 * moment it is created.
 */
function normalizeDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(pacificDayStart());
  return value < today ? null : value;
}

"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { parseMinutes } from "@/lib/timezones";
import {
  availabilityExceptionSchema,
  availabilityFormSchema,
  type AvailabilityExceptionValues,
  type AvailabilityFormValues,
} from "@/lib/validations/availability";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Replaces one person's working week.
 *
 * The whole week at once, not block by block: an edit is "here is my week
 * now", and reconciling additions against removals row by row is a bug
 * waiting for the day someone moves two shifts in one go.
 *
 * Times arrive as wall-clock strings and are stored as minutes in the
 * person's own zone. Nothing here converts to UTC -- see UserAvailability for
 * why storing an instant would be wrong.
 */
export async function saveAvailability(input: AvailabilityFormValues): Promise<ActionResult> {
  const parsed = availabilityFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireOrgContext();
  // Checked here for a readable message; the row-level policy enforces it.
  if (appUser.role !== "admin" && appUser.id !== data.userId) {
    return { ok: false, error: "You can only change your own hours." };
  }

  const blocks = data.blocks.map((b) => {
    const start = parseMinutes(b.start);
    const end = parseMinutes(b.end);
    if (start === null || end === null) throw new Error("bad time");
    return {
      weekday: b.weekday,
      startMinutes: start,
      endMinutes: end,
      label: b.label || null,
      kind: b.kind,
    };
  });

  try {
    await withRLS(authUserId, async (tx) => {
      await tx.user.update({
        where: { id: data.userId },
        data: {
          timeZone: data.timeZone,
          jobTitle: data.jobTitle || null,
          offlineAfterMinutes: data.offlineAfter ? parseMinutes(data.offlineAfter) : null,
          availabilityNote: data.availabilityNote || null,
          estimatedWeeklyHours: data.estimatedWeeklyHours,
        },
      });
      await tx.userAvailability.deleteMany({ where: { userId: data.userId } });
      if (blocks.length > 0) {
        await tx.userAvailability.createMany({
          data: blocks.map((b) => ({ ...b, userId: data.userId })),
        });
      }
    });
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save those hours.",
    };
  }

  revalidatePath("/team");
  revalidatePath("/today");
  return { ok: true };
}

/**
 * Records a one-off change to someone's usual hours -- leave, a blocked
 * afternoon, a day on different hours.
 *
 * A multi-day absence is stored as one row per date, so every day reads the
 * same way and removing one day of a week's leave is a single delete.
 */
export async function addAvailabilityException(
  input: AvailabilityExceptionValues,
): Promise<ActionResult> {
  const parsed = availabilityExceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireOrgContext();
  if (appUser.role !== "admin" && appUser.id !== data.userId) {
    return { ok: false, error: "You can only change your own hours." };
  }

  const wholeDay = data.kind === "Leave" || (data.kind === "Unavailable" && !data.start);
  const startMinutes = wholeDay || !data.start ? null : parseMinutes(data.start);
  const endMinutes = wholeDay || !data.end ? null : parseMinutes(data.end);

  // Dates are calendar days in the person's zone; stepping through them as
  // UTC noons never lands on the wrong day.
  const dates: string[] = [];
  const last = wholeDay && data.through ? data.through : data.date;
  for (
    let d = new Date(`${data.date}T12:00:00Z`);
    d.toISOString().slice(0, 10) <= last;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    dates.push(d.toISOString().slice(0, 10));
    if (dates.length > 62) return { ok: false, error: "Keep it to two months at a time." };
  }

  try {
    await withRLS(authUserId, (tx) =>
      tx.availabilityException.createMany({
        data: dates.map((date) => ({
          userId: data.userId,
          date,
          kind: data.kind,
          startMinutes,
          endMinutes,
          note: data.note || null,
          createdByUserId: appUser.id,
        })),
      }),
    );
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save that change." };
  }

  revalidatePath("/team");
  return { ok: true };
}

export async function deleteAvailabilityException(id: string): Promise<ActionResult> {
  const { authUserId } = await requireOrgContext();
  try {
    // The row-level policy limits this to your own rows, or anyone's for an
    // admin; a refused delete matches nothing rather than erroring.
    const { count } = await withRLS(authUserId, (tx) =>
      tx.availabilityException.deleteMany({ where: { id } }),
    );
    if (count === 0) return { ok: false, error: "That change was already removed, or isn't yours." };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't remove that change." };
  }
  revalidatePath("/team");
  return { ok: true };
}

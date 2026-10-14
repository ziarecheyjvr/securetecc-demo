import { z } from "zod";

const wallTime = z.string().regex(/^\d{1,2}:\d{2}$/, "Use a time like 09:00");

export const availabilityBlockSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    /** Wall-clock times in the person's OWN zone -- see UserAvailability. */
    start: wallTime,
    end: wallTime,
    label: z.string().trim().max(40).nullable(),
    /// Work is time available to SecureTECC; Commitment is other work shown
    /// on the calendar but never counted as ours.
    kind: z.enum(["Work", "Commitment"]),
  })
  .refine((v) => v.start !== v.end, {
    message: "A block needs a start and an end that differ",
    path: ["end"],
  });

export const availabilityFormSchema = z.object({
  userId: z.string().min(1),
  timeZone: z.string().min(1, "Choose a time zone"),
  jobTitle: z.string().trim().max(60).nullable(),
  /// Wall time in their own zone, or null. Never a working hour.
  offlineAfter: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/, "Use a time like 23:00")
    .nullable(),
  availabilityNote: z.string().trim().max(120).nullable(),
  /// A typical week's SecureTECC hours when the blocks understate it.
  estimatedWeeklyHours: z.number().int().min(0).max(80).nullable(),
  /** The whole week, replaced wholesale -- see the action for why. */
  blocks: z.array(availabilityBlockSchema).max(30, "That is a lot of blocks"),
});

export type AvailabilityFormValues = z.infer<typeof availabilityFormSchema>;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const EXCEPTION_KINDS = ["Leave", "Unavailable", "DifferentHours", "Blocked"] as const;

export const EXCEPTION_KIND_LABELS: Record<(typeof EXCEPTION_KINDS)[number], string> = {
  Leave: "On leave",
  Unavailable: "Unavailable",
  DifferentHours: "Working different hours",
  Blocked: "Blocked for another task",
};

/**
 * A one-off change to someone's usual hours.
 *
 * Leave, and whole-day unavailability, can run across several days (`through`);
 * anything with times is a single date, because "2-4pm every day for a week"
 * is a change to the usual week, not an exception to it.
 */
export const availabilityExceptionSchema = z
  .object({
    userId: z.string().min(1),
    date: isoDay,
    through: isoDay.nullable(),
    kind: z.enum(EXCEPTION_KINDS),
    start: wallTime.nullable(),
    end: wallTime.nullable(),
    note: z.string().trim().max(120).nullable(),
  })
  .refine((v) => v.kind === "Leave" || v.kind === "Unavailable" || (v.start && v.end), {
    message: "Give the start and end time",
    path: ["end"],
  })
  .refine((v) => !v.start || !v.end || v.start !== v.end, {
    message: "Start and end must differ",
    path: ["end"],
  })
  .refine((v) => !v.through || v.through >= v.date, {
    message: "The last day can't be before the first",
    path: ["through"],
  });

export type AvailabilityExceptionValues = z.infer<typeof availabilityExceptionSchema>;

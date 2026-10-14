import { z } from "zod";

export const serviceTypeFormSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(10, "Keep it short (e.g. R-S)")
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers, and hyphens only"),
  label: z.string().min(1, "Label is required"),
  billingMinimumHours: z.number().min(0, "Must be zero or more"),
  rateOverride: z.union([z.number(), z.nan()]).optional(),
  /// A rate for this type agreed for LATER -- on-site going to $150 on
  /// 1 Jan 2027. Decided by the date of the work, not today's.
  scheduledRate: z.union([z.number(), z.nan()]).optional(),
  scheduledRateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
    .nullable(),
});

export type ServiceTypeFormValues = z.infer<typeof serviceTypeFormSchema>;

import { z } from "zod";

/**
 * A hand-added invoice line.
 *
 * amount is NOT constrained positive: a negative line is how a credit,
 * discount or correction is written, and rejecting those would push people
 * back to editing the underlying time entries.
 */
export const customItemFormSchema = z.object({
  date: z.string(),
  description: z.string().trim().min(1, "Description is required"),
  hours: z.union([z.number(), z.nan()]).nullable(),
  rate: z.union([z.number(), z.nan()]).nullable(),
  amount: z
    .union([z.number(), z.nan()])
    .refine((v) => !Number.isNaN(v), "Enter an amount"),
});

export type CustomItemFormValues = z.infer<typeof customItemFormSchema>;

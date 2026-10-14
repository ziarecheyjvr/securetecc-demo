import { z } from "zod";

export const EXPENSE_FREQUENCIES = ["Monthly", "Annual", "OneOff"] as const;

export const EXPENSE_FREQUENCY_LABELS: Record<(typeof EXPENSE_FREQUENCIES)[number], string> = {
  Monthly: "Monthly",
  Annual: "Annual",
  OneOff: "One-off",
};

export const businessExpenseFormSchema = z.object({
  name: z.string().trim().min(1, "Give the cost a name").max(120),
  vendor: z.string().trim().max(120).nullable(),
  category: z.string().trim().max(60).nullable(),
  amount: z
    .union([z.number(), z.nan()])
    .refine((v) => !Number.isNaN(v) && v > 0, "Enter an amount greater than zero"),
  frequency: z.enum(EXPENSE_FREQUENCIES),
  /// Null means overhead -- a cost the business carries rather than one that
  /// belongs to a single client. See lib/reports/profitability.ts.
  clientId: z.string().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").nullable(),
  activeStatus: z.boolean(),
  notes: z.string().trim().max(500).nullable(),
});

export type BusinessExpenseFormValues = z.infer<typeof businessExpenseFormSchema>;

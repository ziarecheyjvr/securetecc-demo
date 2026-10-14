import { z } from "zod";

export const reimbursableExpenseFormSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  date: z.string().min(1, "Date is required"), // yyyy-mm-dd
  description: z.string().min(1, "Description is required"),
  amount: z
    .union([z.number(), z.nan()])
    .refine((v) => !Number.isNaN(v) && v > 0, "Enter an amount greater than zero"),
});

export type ReimbursableExpenseFormValues = z.infer<typeof reimbursableExpenseFormSchema>;

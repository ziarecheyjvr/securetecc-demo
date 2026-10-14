import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/payment-methods";

export const paymentFormSchema = z
  .object({
    amount: z.number().positive("Enter an amount greater than zero"),
    receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"),
    method: z.enum(PAYMENT_METHODS),
    /** Only used when method is Other; required then, so "Other" never stands
     *  alone on a bank reconciliation meaning nothing. */
    methodOther: z.string().trim().max(60).nullable(),
    reference: z.string().trim().max(120).nullable(),
    notes: z.string().trim().max(500).nullable(),
  })
  .refine((v) => v.method !== "Other" || !!v.methodOther, {
    message: "Say what the payment method was",
    path: ["methodOther"],
  });

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

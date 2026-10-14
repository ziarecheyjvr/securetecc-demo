import { z } from "zod";

// Same convention as client.ts: no .transform()/.default() on fields used by a
// zodResolver-backed form, since that makes the resolver's input type diverge
// from its output type and breaks useForm<T>'s single-type assumption.
// Defaults come from useForm's defaultValues; normalization happens in the
// server action.
/**
 * In the order they are OFFERED, which is also the order they are listed in --
 * see lib/recurring-order.ts. Site fee first, then RMM, then email security:
 * that is how central each is to the business, and it is the order Tony reads
 * a client record in.
 */
export const ADDON_ITEM_TYPES = [
  "SiteFee",
  "RMM",
  "EmailSecurity",
  "DMARC",
  "RemoteMonitoring",
  "MonitoringSeat",
  "Other",
] as const;

export const ADDON_ITEM_TYPE_LABELS: Record<(typeof ADDON_ITEM_TYPES)[number], string> = {
  SiteFee: "Site Fee",
  RMM: "RMM",
  EmailSecurity: "Email Security",
  DMARC: "DMARC",
  RemoteMonitoring: "Remote Monitoring",
  MonitoringSeat: "Monitoring Seat",
  Other: "Other",
};

export const recurringChargeFormSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z
    .union([z.number(), z.nan()])
    .refine((v) => !Number.isNaN(v) && v > 0, "Enter an amount greater than zero"),
  billingFrequency: z.enum(["Monthly", "Annual"]),
  activeStatus: z.boolean(),
  // Both optional: a plain retainer-style charge never needs to classify
  // itself. itemType only ever pre-fills the amount field in the UI; it's
  // never read by billing logic.
  itemType: z.enum(ADDON_ITEM_TYPES).nullable(),
  /// Seats/devices and the price each, when the charge is counted in units.
  quantity: z.number().int().positive().nullable(),
  unitPrice: z.number().nonnegative().nullable(),
  /// What the service costs SecureTECC each period. The margin is the
  /// difference from the amount charged.
  cost: z.number().nonnegative().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").nullable(),
  authorizedBy: z.string().min(1, "Enter who authorized this charge"),
  // Operational context carried over from the master sheet's Notes column
  // ("18 devices x $25 -- verify count monthly"). Never shown to the client.
  notes: z.string(),
});

export type RecurringChargeFormValues = z.infer<typeof recurringChargeFormSchema>;

import { z } from "zod";

export const timeEntryFormSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  serviceTypeId: z.string().min(1, "Service type is required"),
  date: z.string().min(1, "Date is required"), // yyyy-mm-dd
  durationHours: z.number().positive("Must be greater than zero"),
  description: z.string().min(1, "Description is required"),
  billableStatus: z.enum(["Billable", "NonBillable", "Residual"]),
  /// This job's rate, overriding the service type and the client. Null means
  /// "use the usual one" -- see lib/billing/rates.ts.
  rateOverride: z.number().positive("Enter a rate above zero").nullable(),
  /// One-way travel time in minutes, for on-site work. The billing rule
  /// (one way or return) comes from the client's service area, not from here.
  travelMinutes: z.number().int().min(0).max(600).nullable(),
  /// Who actually did the work. Defaults to the person logging it, and is
  /// editable because Tony logs entries for work someone else did. Empty
  /// means "whoever is logging this", resolved server-side -- the client is
  /// never trusted to name a user id it made up.
  /// Optional as well as nullable: an absent key means "whoever is logging
  /// this", which is what the Voice Logger and the AI parser submit. Making
  /// it required would have made those two paths fail validation and refuse
  /// to save, silently, on a field the person filling them never sees.
  performedByUserId: z.string().nullish(),
  /// Optional project within the client ("CMMC Level 1"). Nullish for the
  /// same reason as performedByUserId: the voice and AI paths never send it.
  project: z.string().trim().max(60).nullish(),
});

export type TimeEntryFormValues = z.infer<typeof timeEntryFormSchema>;

export const BILLABLE_STATUS_LABELS: Record<TimeEntryFormValues["billableStatus"], string> = {
  Billable: "Billable",
  NonBillable: "Non-Billable",
  Residual: "Residual",
};

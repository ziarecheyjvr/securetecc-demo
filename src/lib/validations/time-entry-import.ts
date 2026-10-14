import { z } from "zod";


/** One row after server-side validation/resolution -- what commitTimeEntryImport accepts back. */
export const resolvedImportRowSchema = z.object({
  clientId: z.string().min(1),
  serviceTypeId: z.string().min(1),
  date: z.string().min(1), // yyyy-mm-dd
  durationHours: z.number().positive(),
  description: z.string().min(1),
  billableStatus: z.enum(["Billable", "NonBillable", "Residual"]),
});

export type ResolvedImportRow = z.infer<typeof resolvedImportRowSchema>;

export const BILLABLE_STATUS_ALIASES: Record<string, ResolvedImportRow["billableStatus"]> = {
  billable: "Billable",
  "non-billable": "NonBillable",
  nonbillable: "NonBillable",
  residual: "Residual",
};

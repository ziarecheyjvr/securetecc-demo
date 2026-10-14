import type { BillableStatus } from "@/generated/prisma/enums";

/**
 * Statuses that go on an invoice as work shown but not charged.
 *
 * Residual sits with NonBillable here: both mean the client owes nothing for
 * the entry, and leaving Residual out would make it the one kind of hour that
 * can be neither billed nor shown.
 *
 * Lives outside invoices/actions.ts because that file is "use server", which
 * may only export async functions -- a const or a sync helper there fails the
 * build (and did, once, in production).
 */
export const NON_CHARGE_STATUSES = ["NonBillable", "Residual"] as const satisfies BillableStatus[];

export function isNoCharge(status: BillableStatus): boolean {
  return status !== "Billable";
}

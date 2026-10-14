/**
 * The categories operating costs are grouped under on the monthly position.
 *
 * Stored as plain text on the expense, so a category added here needs no
 * migration and an older free-text value still displays (under "Other").
 */
export const EXPENSE_CATEGORIES = [
  "Software & services",
  "Hosting",
  "Mailbox & email",
  "Business subscriptions",
  "Staff & contractors",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Anything uncategorised or not in the list is reported as "Other". */
export function categoryOf(value: string | null | undefined): ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as ExpenseCategory)
    : "Other";
}

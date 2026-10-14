/**
 * Payment methods, in the order the dropdown shows them.
 *
 * Deliberately NOT in invoices/actions.ts. That file is "use server", where
 * every export must be an async function -- Next turns a plain const into a
 * server reference, and the client component importing it got something that
 * wasn't a function. The page rendered a white screen with "Application error:
 * a client-side exception has occurred", which points nowhere near the cause.
 *
 * Types are fine to export from a server file (they vanish at compile time);
 * values are not.
 */
export const PAYMENT_METHODS = [
  "Check",
  "Cash",
  "ACH",
  "Zelle",
  "PayPal",
  "Venmo",
  "Card",
  "Other",
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

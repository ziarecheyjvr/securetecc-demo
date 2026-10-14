import type { InvoicePdfLineItem } from "./types";

/**
 * Builds the invoice's work log and prose service summary.
 *
 * Kept as pure functions on plain data (no React, no Prisma) so the PDF page
 * and the Google Sheet replica render the SAME text -- the two outputs are
 * sent to the same client and must not describe the period differently.
 */

export type WorkLogEntry = { when: string; code: string | null; description: string };

/** "R-S — ", "O-S [Civil Dept] — ": a service code already leading the text. */
const LEADING_SERVICE_CODE = /^[A-Z]-[A-Z]\s*(\[[^\]]*\])?\s*[\u2014-]\s*/;

/**
 * Whether the code should be printed ahead of the description.
 *
 * Entries imported from the master sheet have the code baked into the text,
 * so prepending it produced "R-S — R-S — Fixed the printer" on both the grid
 * and the work log. Shared by the two so they cannot disagree.
 */
export function shouldPrefixServiceCode(description: string): boolean {
  return !LEADING_SERVICE_CODE.test(description);
}

/** Dated rows keep their date and service code; charges/retainers read "Monthly". */
export function buildWorkLog(lineItems: InvoicePdfLineItem[]): WorkLogEntry[] {
  return lineItems.map((item) => {
    const description = item.description.trim();
    return {
      when: item.date ? formatDate(item.date) : "Monthly",
      code: shouldPrefixServiceCode(description) ? item.serviceCode : null,
      description,
    };
  });
}

/**
 * The one-line lead-in above the work log.
 *
 * This used to re-state every line item as prose: each description was split
 * on sentence boundaries and the clauses re-joined with commas, mimicking the
 * old system's summaries. On a busy month that produced a single run-on
 * paragraph of thirty-odd clauses that no client would read, and it said
 * nothing the DETAILED WORK LOG directly above it had not already said in
 * dated, itemised form. So it is now one static sentence naming the period,
 * and the work log carries the detail.
 */
export function buildServiceSummary(args: {
  clientName: string;
  orgName: string;
  periodLabel: string;
}): string[] {
  const { clientName, orgName, periodLabel } = args;
  return [
    `During ${periodLabel}, ${orgName} provided the IT services itemized above for ${clientName}.`,
  ];
}

/** "Jul 2026" style label for the billing period the invoice covers. */
export function periodLabel(periodStart: string, periodEnd: string): string {
  const start = parseIsoDate(periodStart);
  const end = parseIsoDate(periodEnd);
  const month = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  const a = month(start);
  const b = month(end);
  return a === b ? a : `${a} – ${b}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

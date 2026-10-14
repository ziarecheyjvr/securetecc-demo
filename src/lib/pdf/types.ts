/**
 * Plain, fully-serializable shape handed to the PDF renderer.
 *
 * Prisma `Decimal` and `Date` values are converted to number/ISO-string
 * *before* crossing this boundary -- @react-pdf/renderer receives this in a
 * React tree, and Decimal objects don't render or serialize predictably.
 */

/**
 * One row in the invoice's single line-item table.
 *
 * Time entries populate every field. Recurring-charge and Retainer rows
 * (folded into the same table, matching the master invoice template) leave
 * `date`, `hours`, and `rate` null -- they aren't tied to a single day or an
 * hourly rate, only `description` and `amount` apply.
 */
export type InvoicePdfLineItem = {
  date: string | null; // ISO date
  /**
   * ServiceType.code (e.g. "R-S"), shown in the summary page's work log the
   * way the old system's summaries did. Null for charge/retainer/expense rows,
   * which aren't tied to a service type.
   */
  serviceCode: string | null;
  /**
   * Section heading this row belongs under, e.g. "Monthly Recurring Charges".
   * The renderer emits a full-width divider row whenever this changes, which
   * is how the existing invoices group charges away from dated work. Null for
   * ordinary time-entry rows, which need no heading.
   */
  groupLabel: string | null;
  description: string;
  hours: number | null;
  rate: number | null;
  amount: number | null;
  /**
   * Work shown to the client but not charged for. The hours print, the rate
   * column reads "No charge" and there is no amount -- an invoice that shows
   * the goodwill work alongside the billed work, which is the point of
   * putting it there at all.
   */
  noCharge?: boolean;
};

export type InvoicePdfData = {
  invoiceNumber: string;
  issuedAt: string; // ISO date
  periodStart: string; // ISO date
  periodEnd: string; // ISO date

  organization: {
    name: string;
    logoDataUri: string | null;
    /** Dragon mark for the background watermark; null renders no watermark. */
    watermarkDataUri: string | null;

    // Invoice letterhead -- an individual biller's info, distinct from `name`
    // above. Each is null until Settings → Organization → Invoice letterhead
    // is filled in, and the PDF simply omits the corresponding line.
    billerName: string | null;
    billerAddress1: string | null;
    billerAddress2: string | null;
    billerCityStateZip: string | null;
    officePhone: string | null; // sourced from Organization.phone
    mobilePhone: string | null;
    billerEmail: string | null;
    website: string | null;
    invoiceForLabel: string; // "FOR:" row -- pre-resolved to "IT Services" fallback
    checkPayableTo: string | null;
    acceptedPaymentMethods: string | null;
  };

  client: {
    name: string;
    address1: string | null;
    address2: string | null;
    cityStateZip: string | null;
    phone: string | null;
  };

  lineItems: InvoicePdfLineItem[];

  totalHours: number;
  totalAmount: number;
};

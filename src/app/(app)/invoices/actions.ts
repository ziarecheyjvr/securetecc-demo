"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext, requireOrgContext } from "@/lib/auth";
import { withRLS, type TxClient } from "@/lib/db/rls";
import { PAYMENT_METHODS, type PaymentMethodValue } from "@/lib/payment-methods";
import {
  generateInvoiceSchema,
  invoicePeriodSchema,
  januaryOccurrencesInRange,
  monthsInRange,
  parseIsoDate,
  toIsoDate,
  type GenerateInvoiceValues,
  type InvoicePeriodValues,
} from "@/lib/validations/invoice";
import { generateInvoicePdf } from "@/lib/pdf/generate-invoice-pdf";
import { fetchLogoDataUri, readWatermarkDataUri } from "@/lib/pdf/logo";
import {
  archiveInvoicePdf,
  downloadInvoicePdf,
  invoicePdfFileName,
  invoicePdfPath,
  uploadInvoicePdf,
} from "@/lib/storage/invoices";
import type { InvoicePdfData } from "@/lib/pdf/types";
import { createGmailDraft } from "@/lib/google/gmail";
import { noteWithSignatureHtml } from "@/lib/email/html-body";
import { archiveInvoiceToDrive } from "@/lib/google/archive-invoice";
import { invoiceEmail } from "@/lib/email/templates";
import type { BillableStatus, BillingFrequency } from "@/generated/prisma/enums";
import { isNoCharge, NON_CHARGE_STATUSES } from "@/lib/billing/no-charge";
import { resolveRate, toRate } from "@/lib/billing/rates";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

export type BillingCandidate = {
  id: string;
  date: string;
  description: string;
  hours: number;
  // Both null for a Retainer client's entries: hours are shown for
  // reference, but aren't individually billed (see retainerRate below).
  rate: number | null;
  amount: number | null;
  serviceTypeCode: string;
  serviceTypeLabel: string;
  /** No-charge entries (Non-Billable, Residual) appear only when the review
   *  screen asks for them, and go on the invoice as no-charge lines. */
  billableStatus: BillableStatus;
};

export type RecurringCandidate = {
  /** Composite `${recurringChargeId}:${occurrencePeriodStart}` -- see expandRecurringOccurrences. */
  id: string;
  recurringChargeId: string;
  description: string;
  amount: number;
  billingFrequency: "Monthly" | "Annual";
};

export type ReimbursableCandidate = {
  id: string;
  date: string;
  description: string;
  amount: number;
};

export type BillingCandidates = {
  clientName: string;
  billingType: "Hourly" | "Retainer";
  /** Flat rate billed once per calendar month in the period, for Retainer clients. */
  retainerRate: number | null;
  periodStart: string;
  periodEnd: string;
  timeEntries: BillingCandidate[];
  recurringCharges: RecurringCandidate[];
  reimbursableExpenses: ReimbursableCandidate[];
  /** Entries whose rate can't be resolved -- generation will refuse these. Hourly clients only. */
  unratedEntryIds: string[];
};

/**
 * The rate for one entry, from the entry, the service type, or the client --
 * including a scheduled rate change once the entry's date reaches it. See
 * lib/billing/rates.ts; this wrapper only unwraps Prisma's Decimals.
 */
function rateFor(
  entry: {
    rateOverride: unknown;
    date: Date;
    serviceType: {
      rateOverride: unknown;
      scheduledRate: unknown;
      scheduledRateFrom: Date | null;
    };
  },
  client: { billingRate: unknown; scheduledRate: unknown; scheduledRateFrom: Date | null },
): number | null {
  return resolveRate({
    entryRateOverride: toRate(entry.rateOverride),
    serviceTypeRateOverride: toRate(entry.serviceType.rateOverride),
    serviceTypeScheduledRate: toRate(entry.serviceType.scheduledRate),
    serviceTypeScheduledRateFrom: entry.serviceType.scheduledRateFrom,
    clientBillingRate: toRate(client.billingRate),
    clientScheduledRate: toRate(client.scheduledRate),
    clientScheduledRateFrom: client.scheduledRateFrom,
    entryDate: entry.date,
  });
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    date,
  );
}

/** A charge/retainer row for the PDF's flat line-item table -- no date, hours, or rate. */
function chargeLineItem(
  description: string,
  amount: number,
  groupLabel: string | null = null,
): InvoicePdfData["lineItems"][number] {
  return { date: null, serviceCode: null, groupLabel, description, hours: null, rate: null, amount };
}

/** "Monthly Recurring Charges" / "Annual Recurring Charges". */
function chargeGroupLabel(frequency: "Monthly" | "Annual"): string {
  return `${frequency} Recurring Charges`;
}

type PdfOrganizationRow = {
  name: string;
  phone: string | null;
  billerName: string | null;
  billerAddress1: string | null;
  billerAddress2: string | null;
  billerCityStateZip: string | null;
  billerMobilePhone: string | null;
  billerEmail: string | null;
  website: string | null;
  invoiceForLabel: string | null;
  checkPayableTo: string | null;
  acceptedPaymentMethods: string | null;
};

/** Maps an Organization row to the PDF's letterhead shape. logoDataUri is filled in after, outside the transaction. */
function buildPdfOrganization(organization: PdfOrganizationRow): InvoicePdfData["organization"] {
  return {
    name: organization.name,
    logoDataUri: null,
    watermarkDataUri: null,
    billerName: organization.billerName,
    billerAddress1: organization.billerAddress1,
    billerAddress2: organization.billerAddress2,
    billerCityStateZip: organization.billerCityStateZip,
    officePhone: organization.phone,
    mobilePhone: organization.billerMobilePhone,
    billerEmail: organization.billerEmail,
    website: organization.website,
    invoiceForLabel: organization.invoiceForLabel || "IT Services",
    checkPayableTo: organization.checkPayableTo,
    acceptedPaymentMethods: organization.acceptedPaymentMethods,
  };
}

type RecurringChargeRow = {
  id: string;
  description: string;
  amount: unknown; // Prisma.Decimal, kept opaque here -- always Number()'d before use
  billingFrequency: BillingFrequency;
};

/**
 * Expands each active recurring charge into one occurrence per calendar
 * month (Monthly) or per January (Annual) touched by [periodStart,
 * periodEnd], excluding occurrences already billed on a non-voided invoice.
 * Shared by loadBillingCandidates (read-only preview) and generateInvoice
 * (which re-runs this from scratch server-side rather than trusting the
 * client's selection -- same principle as time-entry rate resolution).
 */
async function expandRecurringOccurrences(
  tx: TxClient,
  charges: RecurringChargeRow[],
  periodStart: Date,
  periodEnd: Date,
): Promise<(RecurringCandidate & { occurrencePeriodStart: Date; occurrencePeriodEnd: Date })[]> {
  if (charges.length === 0) return [];

  const months = monthsInRange(periodStart, periodEnd);
  const januaries = januaryOccurrencesInRange(periodStart, periodEnd);
  const spansMultipleMonths = months.length > 1;

  const occurrences = charges.flatMap((charge) => {
    const periods = charge.billingFrequency === "Monthly" ? months : januaries;
    return periods.map((p) => ({ charge, occStart: p.monthStart, occEnd: p.monthEnd }));
  });
  if (occurrences.length === 0) return [];

  const alreadyBilled = await tx.invoiceRecurringCharge.findMany({
    where: {
      recurringChargeId: { in: charges.map((c) => c.id) },
      invoice: { voidedAt: null },
    },
    select: { recurringChargeId: true, periodStart: true, periodEnd: true },
  });
  const billedKey = (id: string, start: Date, end: Date) =>
    `${id}:${toIsoDate(start)}:${toIsoDate(end)}`;
  const billedSet = new Set(
    alreadyBilled.map((r) => billedKey(r.recurringChargeId, r.periodStart, r.periodEnd)),
  );

  return occurrences
    .filter((o) => !billedSet.has(billedKey(o.charge.id, o.occStart, o.occEnd)))
    .map((o) => ({
      id: `${o.charge.id}:${toIsoDate(o.occStart)}`,
      recurringChargeId: o.charge.id,
      description: spansMultipleMonths
        ? `${o.charge.description} — ${monthLabel(o.occStart)}`
        : o.charge.description,
      amount: Number(o.charge.amount),
      billingFrequency: o.charge.billingFrequency,
      occurrencePeriodStart: o.occStart,
      occurrencePeriodEnd: o.occEnd,
    }));
}

/**
 * Read-only: what *would* go on an invoice for this client + period.
 *
 * Any staff member can run this; it writes nothing.
 */
export async function loadBillingCandidates(
  input: InvoicePeriodValues,
): Promise<ActionResult<BillingCandidates>> {
  const parsed = invoicePeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { clientId, includeNonBillable } = parsed.data;
  const billableStatuses: BillableStatus[] = includeNonBillable
    ? ["Billable", ...NON_CHARGE_STATUSES]
    : ["Billable"];
  const periodStart = parseIsoDate(parsed.data.periodStart);
  const periodEnd = parseIsoDate(parsed.data.periodEnd);

  const { authUserId } = await requireOrgContext();

  try {
    const result = await withRLS(authUserId, async (tx) => {
      const client = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
      const isRetainer = client.billingType === "Retainer";

      const [timeEntries, recurringCharges, reimbursableExpenses] = await Promise.all([
        tx.timeEntry.findMany({
          where: {
            clientId,
            invoiceId: null, // unbilled only
            billableStatus: { in: billableStatuses },
            date: { gte: periodStart, lte: periodEnd },
          },
          include: { serviceType: true },
          orderBy: { date: "asc" },
        }),
        tx.recurringCharge.findMany({
          where: { clientId, activeStatus: true },
          orderBy: [{ billingFrequency: "asc" }, { description: "asc" }],
        }),
        tx.reimbursableExpense.findMany({
          where: {
            clientId,
            invoiceId: null, // unbilled only
            date: { gte: periodStart, lte: periodEnd },
          },
          orderBy: { date: "asc" },
        }),
      ]);

      const clientRate = client.billingRate ? Number(client.billingRate) : null;

      const candidates: BillingCandidate[] = timeEntries.map((entry) => {
        const hours = Number(entry.durationHours);
        // Retainer, and non-billable anywhere: hours are informational only,
        // never billed per-entry.
        if (isRetainer || isNoCharge(entry.billableStatus)) {
          return {
            id: entry.id,
            date: entry.date.toISOString().slice(0, 10),
            description: entry.description,
            hours,
            rate: null,
            amount: null,
            serviceTypeCode: entry.serviceType.code,
            serviceTypeLabel: entry.serviceType.label,
            billableStatus: entry.billableStatus,
          };
        }
        const rate = rateFor(entry, client);
        return {
          id: entry.id,
          date: entry.date.toISOString().slice(0, 10),
          description: entry.description,
          hours,
          rate,
          amount: rate === null ? null : Number((hours * rate).toFixed(2)),
          serviceTypeCode: entry.serviceType.code,
          serviceTypeLabel: entry.serviceType.label,
          billableStatus: entry.billableStatus,
        };
      });

      const applicable = await expandRecurringOccurrences(tx, recurringCharges, periodStart, periodEnd);

      return {
        clientName: client.name,
        billingType: client.billingType,
        retainerRate: isRetainer ? clientRate : null,
        periodStart: toIsoDate(periodStart),
        periodEnd: toIsoDate(periodEnd),
        timeEntries: candidates,
        recurringCharges: applicable.map(
          ({ occurrencePeriodStart: _s, occurrencePeriodEnd: _e, ...rest }) => rest,
        ),
        reimbursableExpenses: reimbursableExpenses.map((e) => ({
          id: e.id,
          date: e.date.toISOString().slice(0, 10),
          description: e.description,
          amount: Number(e.amount),
        })),
        // Hourly only -- a Retainer entry with no rate isn't an error, it's expected.
        unratedEntryIds: isRetainer
          ? []
          : candidates
              .filter((c) => c.billableStatus === "Billable" && c.rate === null)
              .map((c) => c.id),
      } satisfies BillingCandidates;
    });

    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Creates the Draft invoice.
 *
 * Everything money-related is re-derived from the database here; the submitted
 * ids are treated purely as a selection filter, never as a source of amounts
 * (same principle as the billing-minimum handling in time-entries/actions.ts).
 */
export async function generateInvoice(
  input: GenerateInvoiceValues,
): Promise<
  ActionResult<{
    invoiceId: string;
    invoiceNumber: string;
    pdfFailed: boolean;
    archiveWarning?: string;
  }>
> {
  const parsed = generateInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const {
    clientId,
    timeEntryIds,
    recurringChargeOccurrenceIds,
    reimbursableExpenseIds,
    includeNonBillable,
  } = parsed.data;
  const periodStart = parseIsoDate(parsed.data.periodStart);
  const periodEnd = parseIsoDate(parsed.data.periodEnd);

  if (
    timeEntryIds.length === 0 &&
    recurringChargeOccurrenceIds.length === 0 &&
    reimbursableExpenseIds.length === 0
  ) {
    return { ok: false, error: "Select at least one item to invoice." };
  }

  const { authUserId, appUser } = await requireOrgContext();

  let pdfInput: { invoiceId: string; data: InvoicePdfData } | null = null;
  let invoiceNumber = "";
  let invoiceId = "";

  try {
    const created = await withRLS(authUserId, async (tx) => {
      const [organization, client] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: appUser.organizationId } }),
        tx.client.findUniqueOrThrow({ where: { id: clientId } }),
      ]);
      const isRetainer = client.billingType === "Retainer";

      // Re-verify the submitted selection against the DB with the same
      // conditions loadBillingCandidates used. A mismatch means something
      // changed underneath (e.g. a concurrent invoice claimed an entry) --
      // fail loudly rather than silently under- or over-billing.
      const entries = await tx.timeEntry.findMany({
        where: {
          id: { in: timeEntryIds },
          clientId,
          invoiceId: null,
          billableStatus: includeNonBillable
            ? { in: ["Billable", ...NON_CHARGE_STATUSES] }
            : "Billable",
          date: { gte: periodStart, lte: periodEnd },
        },
        include: { serviceType: true },
        orderBy: { date: "asc" },
      });

      if (entries.length !== timeEntryIds.length) {
        throw new ConflictError(
          "Some selected time entries are no longer available to invoice — they may have been " +
            "edited or invoiced elsewhere. Reload the review screen and try again.",
        );
      }

      // Re-expand from scratch -- never trust the period embedded in a
      // client-submitted composite id.
      const allActiveCharges = await tx.recurringCharge.findMany({
        where: { clientId, activeStatus: true },
      });
      const occurrences = await expandRecurringOccurrences(
        tx,
        allActiveCharges,
        periodStart,
        periodEnd,
      );
      const selectedOccurrences = occurrences.filter((o) =>
        recurringChargeOccurrenceIds.includes(o.id),
      );
      if (selectedOccurrences.length !== recurringChargeOccurrenceIds.length) {
        throw new ConflictError(
          "Some selected recurring charges are no longer available — they may already be billed, " +
            "inactive, or outside this period. Reload the review screen and try again.",
        );
      }

      // Same re-verification principle as time entries above.
      const reimbursables = await tx.reimbursableExpense.findMany({
        where: {
          id: { in: reimbursableExpenseIds },
          clientId,
          invoiceId: null,
          date: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { date: "asc" },
      });
      if (reimbursables.length !== reimbursableExpenseIds.length) {
        throw new ConflictError(
          "Some selected expenses are no longer available to invoice — they may have been " +
            "edited or invoiced elsewhere. Reload the review screen and try again.",
        );
      }

      // Resolve rates. Refusing is deliberate -- a $0/NaN line item on a real
      // invoice is worse than a failed generation.
      const clientRate = client.billingRate ? Number(client.billingRate) : null;
      if (isRetainer && clientRate === null) {
        throw new ConflictError(
          `${client.name} is billed as Retainer but has no billing rate set. Set one on the client first.`,
        );
      }

      const lineItems = entries.map((entry) => {
        const hours = Number(entry.durationHours);
        const noCharge = isNoCharge(entry.billableStatus);
        if (isRetainer || noCharge) {
          return {
            date: entry.date.toISOString().slice(0, 10),
            serviceCode: entry.serviceType.code,
            groupLabel: null,
            description: entry.description,
            hours,
            rate: null as number | null,
            amount: null as number | null,
            noCharge,
          };
        }
        const rate = rateFor(entry, client);
        if (rate === null) {
          throw new ConflictError(
            `No rate available for "${entry.description.slice(0, 40)}…" ` +
              `(${entry.serviceType.code}). Set a rate override on the service type or a ` +
              `billing rate on the client.`,
          );
        }
        return {
          date: entry.date.toISOString().slice(0, 10),
          serviceCode: entry.serviceType.code,
          groupLabel: null,
          description: entry.description,
          hours,
          rate,
          amount: Number((hours * rate).toFixed(2)),
        };
      });

      // Billed hours only. Non-billable rows print their hours on the invoice
      // but must not move a figure the dashboard and reports read as billable.
      const totalHours = Number(
        lineItems.reduce((s, l) => s + (l.noCharge ? 0 : l.hours), 0).toFixed(2),
      );
      const chargeTotal = selectedOccurrences.reduce((s, o) => s + o.amount, 0);
      const reimbursableTotal = reimbursables.reduce((s, e) => s + Number(e.amount), 0);

      // Retainer: a flat rate billed once per calendar month, replacing the
      // time-based total entirely. Months already billed on a non-voided
      // invoice are excluded here -- without that, two invoices whose periods
      // both touch March would each charge March's retainer. Same ledger
      // approach InvoiceRetainerPeriod exists for, mirroring how
      // expandRecurringOccurrences dedupes recurring charges.
      let retainerOccurrences: { monthStart: Date; monthEnd: Date }[] = [];
      if (isRetainer) {
        const candidateMonths = monthsInRange(periodStart, periodEnd);
        const alreadyBilled = await tx.invoiceRetainerPeriod.findMany({
          where: { clientId, invoice: { voidedAt: null } },
          select: { periodStart: true },
        });
        const billed = new Set(alreadyBilled.map((r) => toIsoDate(r.periodStart)));
        retainerOccurrences = candidateMonths.filter(
          (m) => !billed.has(toIsoDate(m.monthStart)),
        );

        if (retainerOccurrences.length === 0) {
          throw new ConflictError(
            `Every month in this period has already been billed to ${client.name}'s retainer. ` +
              "Void the earlier invoice first, or choose a different period.",
          );
        }
      }
      const retainerMonths = retainerOccurrences.length;
      const retainerTotal = isRetainer ? (clientRate as number) * retainerMonths : 0;
      const timeTotal = isRetainer
        ? retainerTotal
        : lineItems.reduce((s, l) => s + (l.amount ?? 0), 0);
      const totalAmount = Number((timeTotal + chargeTotal + reimbursableTotal).toFixed(2));

      // Atomic per-client sequence. Postgres row-locks the client row for this
      // UPDATE, so two concurrent generations for the same client serialize.
      const bumped = await tx.client.update({
        where: { id: clientId },
        data: { lastInvoiceSequence: { increment: 1 } },
        select: { lastInvoiceSequence: true, shortName: true },
      });
      const number = `${bumped.shortName}-${String(bumped.lastInvoiceSequence).padStart(5, "0")}`;

      const invoice = await tx.invoice.create({
        data: {
          organizationId: appUser.organizationId,
          clientId,
          invoiceNumber: number,
          periodStart,
          periodEnd,
          totalHours,
          totalAmount,
          status: "Draft",
        },
      });

      await tx.timeEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) } },
        data: { invoiceId: invoice.id },
      });

      if (reimbursables.length > 0) {
        await tx.reimbursableExpense.updateMany({
          where: { id: { in: reimbursables.map((e) => e.id) } },
          data: { invoiceId: invoice.id },
        });
      }

      if (retainerOccurrences.length > 0) {
        await tx.invoiceRetainerPeriod.createMany({
          data: retainerOccurrences.map((m) => ({
            organizationId: appUser.organizationId,
            invoiceId: invoice.id,
            clientId,
            periodStart: m.monthStart,
            periodEnd: m.monthEnd,
            // Snapshot the rate, so a later change to Client.billingRate
            // never rewrites what a past invoice charged.
            amount: clientRate as number,
          })),
        });
      }

      if (selectedOccurrences.length > 0) {
        await tx.invoiceRecurringCharge.createMany({
          data: selectedOccurrences.map((o) => ({
            organizationId: appUser.organizationId,
            invoiceId: invoice.id,
            recurringChargeId: o.recurringChargeId,
            description: o.description,
            amount: o.amount,
            billingFrequency: o.billingFrequency,
            periodStart: o.occurrencePeriodStart,
            periodEnd: o.occurrencePeriodEnd,
          })),
        });
      }

      // Charge/retainer/expense rows fold into the same flat table as extra
      // rows, matching the org's canonical invoice template -- no separate
      // "Monthly/Annual Recurring Charges" or "Retainer" sections.
      const chargeRows = selectedOccurrences.map((o) =>
        chargeLineItem(o.description, o.amount, chargeGroupLabel(o.billingFrequency)),
      );
      const expenseRows = reimbursables.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        serviceCode: null,
        groupLabel: null,
        description: e.description,
        hours: null,
        rate: null,
        amount: Number(e.amount),
      }));
      const retainerRow = isRetainer
        ? [
            chargeLineItem(
              retainerMonths > 1
                ? `${client.name} — Retainer (${retainerMonths} months)`
                : `${client.name} — Retainer`,
              retainerTotal,
            ),
          ]
        : [];

      const data: InvoicePdfData = {
        invoiceNumber: number,
        issuedAt: new Date().toISOString().slice(0, 10),
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        organization: buildPdfOrganization(organization),
        client: {
          name: client.name,
          address1: client.address1,
          address2: client.address2,
          cityStateZip: client.cityStateZip,
          phone: client.phone,
        },
        lineItems: [...lineItems, ...expenseRows, ...chargeRows, ...retainerRow],
        totalHours,
        totalAmount,
      };

      return { invoiceId: invoice.id, invoiceNumber: number, data, logoUrl: organization.logoUrl };
    });

    invoiceId = created.invoiceId;
    invoiceNumber = created.invoiceNumber;
    pdfInput = { invoiceId: created.invoiceId, data: created.data };
    // Fetch outside the transaction -- it's a network call, and the PDF render
    // below already runs after commit for the same reason.
    pdfInput.data.organization.logoDataUri = await fetchLogoDataUri(created.logoUrl);
    pdfInput.data.organization.watermarkDataUri = await readWatermarkDataUri();
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  // PDF render + upload happen AFTER the transaction commits -- rendering is
  // slow and shouldn't hold a DB transaction open. If it fails, the invoice is
  // still correct (line items are linked); the detail page offers a retry.
  let pdfFailed = false;
  let archiveWarning: string | undefined;
  try {
    const pdf = await generateInvoicePdf(pdfInput.data);
    const path = invoicePdfPath(appUser.organizationId, clientId, invoiceId);
    await uploadInvoicePdf(path, pdf);
    await withRLS(authUserId, (tx) =>
      tx.invoice.update({ where: { id: invoiceId }, data: { pdfUrl: path } }),
    );

    // Drive archiving is best-effort and never throws -- a correctly billed
    // invoice must not be undone because Drive was unreachable. Silently a
    // no-op when Google isn't configured yet.
    const archived = await archiveInvoiceToDrive({
      invoiceNumber,
      clientName: pdfInput.data.client.name,
      year: periodEnd.getUTCFullYear(),
      pdf,
      data: pdfInput.data,
    });
    if (!archived.ok && !archived.skipped) archiveWarning = archived.error;
  } catch {
    pdfFailed = true;
  }

  revalidatePath("/invoices");
  revalidatePath("/time-entries");
  return { ok: true, data: { invoiceId, invoiceNumber, pdfFailed, archiveWarning } };
}

/** Re-renders the PDF for an invoice that has none (or a stale one). */
export async function regenerateInvoicePdf(
  id: string,
  /**
   * Also push the PDF + Sheet copy to Drive.
   *
   * Off by default on purpose. Imported historical invoices already have real
   * PDFs sitting in Drive from the old system, and the archiver REPLACES
   * same-named files -- so an unguarded archive here would overwrite a genuine
   * invoice with a regenerated approximation of it. Only the deliberate act of
   * drafting the email turns this on.
   */
  options: { archiveToDrive?: boolean } = {},
): Promise<ActionResult> {
  const { authUserId, appUser } = await requireOrgContext();

  try {
    const data = await withRLS(authUserId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: {
          client: true,
          organization: true,
          timeEntries: { include: { serviceType: true }, orderBy: { date: "asc" } },
          recurringCharges: true,
          reimbursableExpenses: { orderBy: { date: "asc" } },
          customItems: { orderBy: { sortOrder: "asc" } },
        },
      });
      const isRetainer = invoice.client.billingType === "Retainer";

      const clientRate = invoice.client.billingRate ? Number(invoice.client.billingRate) : null;
      const lineItems = invoice.timeEntries.map((entry) => {
        const hours = Number(entry.durationHours);
        const noCharge = isNoCharge(entry.billableStatus);
        if (isRetainer || noCharge) {
          return {
            date: entry.date.toISOString().slice(0, 10),
            serviceCode: entry.serviceType.code,
            groupLabel: null,
            description: entry.description,
            hours,
            rate: null as number | null,
            amount: null as number | null,
            noCharge,
          };
        }
        const rate = rateFor(entry, invoice.client) ?? 0;
        return {
          date: entry.date.toISOString().slice(0, 10),
          serviceCode: entry.serviceType.code,
          groupLabel: null,
          description: entry.description,
          hours,
          rate,
          amount: Number((hours * rate).toFixed(2)),
        };
      });

      // Charge/retainer/expense rows fold into the same flat table as extra rows.
      const chargeRows = invoice.recurringCharges.map((c) =>
        chargeLineItem(c.description, Number(c.amount)),
      );
      const expenseRows = invoice.reimbursableExpenses.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        serviceCode: null,
        groupLabel: null,
        description: e.description,
        hours: null,
        rate: null,
        amount: Number(e.amount),
      }));
      // Retainer total isn't separately stored -- re-derive it as
      // (invoice total minus recurring charges minus expenses), which is
      // exact since generation computed totalAmount the same way.
      const recurringTotal = invoice.recurringCharges.reduce((s, c) => s + Number(c.amount), 0);
      const expenseTotal = invoice.reimbursableExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const retainerRow = isRetainer
        ? [
            chargeLineItem(
              `${invoice.client.name} — Retainer`,
              Number((Number(invoice.totalAmount) - recurringTotal - expenseTotal).toFixed(2)),
            ),
          ]
        : [];

      return {
        invoice,
        pdf: {
          invoiceNumber: invoice.invoiceNumber,
          issuedAt: invoice.createdAt.toISOString().slice(0, 10),
          periodStart: invoice.periodStart.toISOString().slice(0, 10),
          periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
          organization: buildPdfOrganization(invoice.organization),
          client: {
            name: invoice.client.name,
            address1: invoice.client.address1,
            address2: invoice.client.address2,
            cityStateZip: invoice.client.cityStateZip,
            phone: invoice.client.phone,
          },
          // Hand-added lines render last, after everything derived, so an
          // adjustment reads as an adjustment TO the work above it.
          lineItems: [
            ...lineItems,
            ...expenseRows,
            ...chargeRows,
            ...retainerRow,
            ...invoice.customItems.map((c) => ({
              date: c.date ? c.date.toISOString().slice(0, 10) : null,
              serviceCode: null,
              groupLabel: null,
              description: c.description,
              hours: c.hours === null ? null : Number(c.hours),
              rate: c.rate === null ? null : Number(c.rate),
              amount: Number(c.amount),
            })),
          ],
          totalHours: Number(invoice.totalHours),
          totalAmount: Number(invoice.totalAmount),
        } satisfies InvoicePdfData,
      };
    });

    // Fetch outside the transaction -- it's a network call.
    data.pdf.organization.logoDataUri = await fetchLogoDataUri(data.invoice.organization.logoUrl);
    data.pdf.organization.watermarkDataUri = await readWatermarkDataUri();

    const pdf = await generateInvoicePdf(data.pdf);
    const path = invoicePdfPath(appUser.organizationId, data.invoice.clientId, id);
    await uploadInvoicePdf(path, pdf);
    await withRLS(authUserId, (tx) =>
      tx.invoice.update({ where: { id }, data: { pdfUrl: path } }),
    );

    if (options.archiveToDrive) {
      // Best-effort, same as at generation time: Drive being unreachable must
      // not fail an action whose real job succeeded.
      await archiveInvoiceToDrive({
        invoiceNumber: data.invoice.invoiceNumber,
        clientName: data.invoice.client.name,
        year: data.invoice.periodEnd.getUTCFullYear(),
        pdf,
        data: data.pdf,
      });
    }
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

/**
 * Creates a Gmail DRAFT of the invoice, with the PDF attached, in the
 * Workspace mailbox the service account impersonates.
 *
 * Deliberately does NOT touch invoice status: the draft is unsent until a
 * human sends it from Gmail, and marking it Sent here would make the app
 * claim something untrue about money owed. markInvoiceSent below is the
 * separate, explicit confirmation step.
 */
export async function createInvoiceGmailDraft(
  id: string,
  /**
   * Which saved signature to sign the draft with. Omitted means "my default";
   * an explicit null means send it plain, which is what the draft did before
   * signatures existed.
   */
  signatureId?: string | null,
): Promise<ActionResult<{ draftUrl: string; reused: boolean }>> {
  const { authUserId, appUser } = await requireAdminContext();

  try {
    const invoice = await withRLS(authUserId, (tx) =>
      tx.invoice.findUniqueOrThrow({
        where: { id },
        include: { organization: true, client: true },
      }),
    );

    if (invoice.voidedAt) throw new ConflictError("This invoice has been voided.");
    if (!invoice.client.email) {
      throw new ConflictError(`${invoice.client.name} has no billing email on file.`);
    }
    if (!invoice.pdfUrl) {
      // Imported invoices carry no PDF: the originals live in Drive already,
      // so nothing is rendered at import time. Build one now -- this is the
      // first moment the document is actually needed -- and archive it, since
      // drafting the email is the deliberate act that says this invoice is
      // going out.
      const built = await regenerateInvoicePdf(id, { archiveToDrive: true });
      if (!built.ok) throw new ConflictError(`Couldn't build the PDF: ${built.error}`);

      const refreshed = await withRLS(authUserId, (tx) =>
        tx.invoice.findUniqueOrThrow({ where: { id }, select: { pdfUrl: true } }),
      );
      if (!refreshed.pdfUrl) throw new ConflictError("The PDF was built but not stored.");
      invoice.pdfUrl = refreshed.pdfUrl;
    }

    // The client actually needs the invoice document, not just a summary --
    // the previous Resend path sent HTML with nothing attached.
    const pdf = await downloadInvoicePdf(invoice.pdfUrl);
    const email = invoiceEmail(
      {
        organizationName: invoice.organization.name,
        primaryColor: invoice.organization.brandColorPrimary,
        accentColor: invoice.organization.brandColorAccent,
        logoUrl: invoice.organization.logoUrl,
        phone: invoice.organization.phone,
      },
      {
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.client.name,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        totalAmount: Number(invoice.totalAmount),
      },
    );

    // A signature is the sender's own row; RLS keeps this to signatures the
    // signed-in user owns, so an id from elsewhere simply finds nothing.
    const signature =
      signatureId === null
        ? null
        : await withRLS(authUserId, (tx) =>
            tx.emailSignature.findFirst({
              where: signatureId
                ? { id: signatureId, ownerUserId: appUser.id }
                : { ownerUserId: appUser.id, isDefault: true },
              select: { html: true },
            }),
          );

    const draft = await createGmailDraft(
      {
      to: invoice.client.email,
      from: invoice.organization.invoiceFromEmail ?? invoice.organization.supportEmail,
      subject: email.subject,
      text: email.text,
      html: signature ? noteWithSignatureHtml(email.text, signature.html) : undefined,
        attachment: {
          filename: invoicePdfFileName(invoice.invoiceNumber, invoice.client.name),
          content: pdf,
          mimeType: "application/pdf",
        },
      },
      invoice.gmailDraftId,
    );

    await withRLS(authUserId, (tx) =>
      tx.invoice.update({ where: { id }, data: { gmailDraftId: draft.draftId } }),
    );

    revalidatePath(`/invoices/${id}`);
    return { ok: true, data: { draftUrl: draft.url, reused: !!invoice.gmailDraftId } };
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Records that an invoice has actually been sent.
 *
 * No longer sends anything itself: invoices go out as a reviewed Gmail draft
 * (see createInvoiceGmailDraft), so this is purely the confirmation step the
 * admin clicks once it's really gone out. Ticket and digest email still go
 * through Resend -- that split is intentional.
 */
/**
 * Draft -> Invoiced. The commitment step, and deliberately not tied to email.
 *
 * Before this existed the only way out of Draft was "Mark as sent", which
 * forced a lie: an invoice that had been finalised but posted by hand, or paid
 * straight off a downloaded PDF, had to be recorded as Sent or left sitting in
 * Draft forever. Neither is true, and Draft totals feed the dashboard
 * differently from issued ones.
 *
 * Refuses an empty invoice. A Draft with nothing on it is a mistake every
 * time, and finalising it would burn an invoice number on nothing.
 */
export async function finalizeInvoice(id: string): Promise<ActionResult> {
  const { authUserId } = await requireAdminContext();

  try {
    await withRLS(authUserId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: {
          _count: { select: { timeEntries: true, customItems: true, recurringCharges: true } },
        },
      });
      if (invoice.voidedAt) throw new ConflictError("This invoice has been voided.");
      if (invoice.status !== "Draft") {
        throw new ConflictError(`This invoice is already ${invoice.status}.`);
      }
      const lines =
        invoice._count.timeEntries + invoice._count.customItems + invoice._count.recurringCharges;
      if (lines === 0) {
        throw new ConflictError("There's nothing on this invoice yet.");
      }

      await tx.invoice.update({
        where: { id },
        data: { status: "Invoiced", issuedAt: new Date() },
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Records that the invoice went to the client.
 *
 * Accepts a Draft as well as an Invoiced one, and back-fills issuedAt when it
 * does: sending an invoice necessarily issues it, and refusing the shortcut
 * would only make the common case slower without making the data truer.
 */
export async function markInvoiceSent(id: string): Promise<ActionResult> {
  // Admin-only, per the RLS split: only admins transition invoice status.
  const { authUserId } = await requireAdminContext();

  try {
    await withRLS(authUserId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
      if (invoice.voidedAt) throw new ConflictError("This invoice has been voided.");
      if (invoice.status !== "Draft" && invoice.status !== "Invoiced") {
        throw new ConflictError(`This invoice is already ${invoice.status}.`);
      }
      const now = new Date();
      await tx.invoice.update({
        where: { id },
        data: { status: "Sent", sentAt: now, issuedAt: invoice.issuedAt ?? now },
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

export async function markInvoicePaid(id: string): Promise<ActionResult> {
  const { authUserId } = await requireAdminContext();

  try {
    await withRLS(authUserId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
      if (invoice.voidedAt) throw new ConflictError("This invoice has been voided.");
      // Invoiced counts as payable: money arriving against an invoice that
      // was handed over rather than emailed is ordinary, and forcing it
      // through Sent first would record a delivery that never happened.
      if (invoice.status !== "Sent" && invoice.status !== "Invoiced") {
        throw new ConflictError("Only an issued invoice can be marked Paid.");
      }
      const now = new Date();
      await tx.invoice.update({
        where: { id },
        data: { status: "Paid", paidAt: now, issuedAt: invoice.issuedAt ?? now },
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

/**
 * Voids an invoice: frees its time entries AND reimbursable expenses to be
 * re-invoiced, removes its recurring-charge snapshots (re-opening those
 * charges for that period), marks it voided, and archives rather than
 * deletes the PDF.
 */
export async function voidInvoice(
  id: string,
): Promise<ActionResult<{ pdfArchived: boolean }>> {
  const { authUserId, appUser } = await requireAdminContext();

  let pdfUrl: string | null = null;
  let clientId = "";

  try {
    const result = await withRLS(authUserId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
      if (invoice.voidedAt) throw new ConflictError("This invoice is already voided.");

      await tx.timeEntry.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
      await tx.reimbursableExpense.updateMany({
        where: { invoiceId: id },
        data: { invoiceId: null },
      });
      await tx.invoiceRecurringCharge.deleteMany({ where: { invoiceId: id } });
      // Re-opens those calendar months so the retainer can be billed again.
      await tx.invoiceRetainerPeriod.deleteMany({ where: { invoiceId: id } });
      // gmailDraftId is cleared too: a voided invoice's draft must not be
      // refreshed by a later click, and the id would otherwise point at a
      // draft for an invoice that no longer stands.
      await tx.invoice.update({
        where: { id },
        data: { voidedAt: new Date(), gmailDraftId: null },
      });

      return { pdfUrl: invoice.pdfUrl, clientId: invoice.clientId };
    });
    pdfUrl = result.pdfUrl;
    clientId = result.clientId;
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  // Storage move is best-effort: the DB effects above are what actually matter
  // for billing correctness, so a failed move warns rather than rolls back.
  let pdfArchived = true;
  if (pdfUrl) {
    const moved = await archiveInvoicePdf(pdfUrl, appUser.organizationId, clientId, id);
    if (moved) {
      await withRLS(authUserId, (tx) =>
        tx.invoice.update({ where: { id }, data: { pdfUrl: moved } }),
      );
    } else {
      pdfArchived = false;
    }
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/time-entries");
  return { ok: true, data: { pdfArchived } };
}

class ConflictError extends Error {}

function errorMessage(err: unknown): string {
  if (err instanceof ConflictError) return err.message;
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return "That record no longer exists.";
    if (code === "P2002") {
      return "An invoice with that number already exists for this client.";
    }
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

/**
 * Reverses a void, putting the invoice back to Draft.
 *
 * Only the invoice row itself is restored. The time entries, expenses and
 * charges the void released are NOT re-attached: they may well have been
 * billed on another invoice by now, and silently pulling them back would
 * either double-bill them or corrupt that other invoice. So this returns an
 * empty Draft, and the work is re-selected by generating again -- which is
 * also the only path that recomputes the total honestly.
 *
 * The invoice NUMBER is preserved, matching how the void kept it: an
 * accounting sequence with a hole in it is a question someone has to answer
 * later.
 */
export async function unvoidInvoice(id: string): Promise<ActionResult> {
  const { authUserId } = await requireAdminContext();

  try {
    await withRLS(authUserId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
      if (!invoice.voidedAt) throw new ConflictError("This invoice isn't voided.");

      await tx.invoice.update({
        where: { id },
        data: { voidedAt: null, status: "Draft", sentAt: null, paidAt: null },
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

/**
 * Corrects the sent/paid dates and payment method on an invoice.
 *
 * Marking an invoice sent or paid stamps "now", which is right for something
 * happening today and wrong for history: the imported invoices were sent and
 * paid weeks before they existed here. Without this, a July invoice recorded
 * today looks brand new, so it never enters the 30-day chase list and its
 * payment lands in the wrong month's collections.
 *
 * Dates are date-only strings parsed to UTC midnight, matching how every
 * other calendar date in the app is stored -- `new Date("2026-07-10")` read
 * back in Pacific would be 9 July.
 */
export async function updateInvoicePaymentDetails(
  id: string,
  input: { sentAt: string | null; paidAt: string | null; paymentMethod: string | null },
): Promise<ActionResult> {
  const { authUserId } = await requireAdminContext();

  const toDate = (value: string | null): Date | null => {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  };

  const sentAt = toDate(input.sentAt);
  const paidAt = toDate(input.paidAt);

  if (input.sentAt && !sentAt) return { ok: false, error: "That sent date isn't valid." };
  if (input.paidAt && !paidAt) return { ok: false, error: "That paid date isn't valid." };
  // NOT rejected when the paid date precedes the sent date. That looked like a
  // data-entry slip, and it is often a transposition -- but it is also a real
  // situation: a client pays on account, or settles work before the invoice is
  // formally raised, which is exactly what happened with MSAFC-00001 (paid 10
  // August, invoiced 31 August). Refusing it left the true dates unrecordable.
  //
  // The dates are stored as given. What DOES ignore the combination is the
  // payment-speed report, which skips negative intervals rather than letting
  // one advance payment drag a client's average below zero.
  const method = input.paymentMethod;
  if (method && !PAYMENT_METHODS.includes(method as PaymentMethodValue)) {
    return { ok: false, error: "Unknown payment method." };
  }

  try {
    await withRLS(authUserId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
      if (invoice.voidedAt) throw new ConflictError("This invoice has been voided.");

      // Dates imply status. Recording a payment on a Draft and leaving it a
      // Draft would keep it out of every revenue figure it belongs in.
      const status = paidAt ? "Paid" : sentAt ? "Sent" : invoice.status;

      await tx.invoice.update({
        where: { id },
        data: {
          sentAt,
          paidAt,
          paymentMethod: (method as PaymentMethodValue | null) ?? null,
          status,
          issuedAt: invoice.issuedAt ?? sentAt ?? paidAt,
        },
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

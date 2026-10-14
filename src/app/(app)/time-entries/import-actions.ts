"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { parseCsv } from "@/lib/csv";
import { mapCsvColumns, type CsvFieldMapping } from "@/lib/ai/csv-mapping";
import {
  resolvedImportRowSchema,
  BILLABLE_STATUS_ALIASES,
  type ResolvedImportRow,
} from "@/lib/validations/time-entry-import";

const MAX_ROWS = 1000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type PreviewRow = {
  /** 1-based, matches the CSV's data rows (header excluded). */
  rowNumber: number;
  raw: Record<string, string>;
  resolved: ResolvedImportRow | null;
  error: string | null;
};

export type PreviewResult =
  | { ok: true; rows: PreviewRow[]; validCount: number }
  | { ok: false; error: string };

/**
 * Parses an uploaded CSV, resolves each row's clientShortName/serviceTypeCode
 * against this org's actual records, and applies the same billing-minimum
 * floor createTimeEntry does -- so the preview total matches what actually
 * gets billed once imported. Writes nothing.
 */
export async function previewTimeEntryImport(formData: FormData): Promise<PreviewResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV file." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File is too large (max 2MB)." };
  }

  const records = parseCsv(await file.text());
  if (records.length === 0) {
    return { ok: false, error: "No rows found in that file." };
  }
  if (records.length > MAX_ROWS) {
    return { ok: false, error: `Import at most ${MAX_ROWS} rows at a time.` };
  }

  const { authUserId, appUser } = await requireOrgContext();

  // parseCsv lowercases header keys, so the mapping works against those.
  const headers = Object.keys(records[0]);
  const { mapping } = await mapCsvColumns(headers, records.slice(0, 3));

  /** Reads a field from a row via the resolved mapping. */
  const field = (row: Record<string, string>, key: keyof CsvFieldMapping): string =>
    (mapping[key] ? row[mapping[key]] : "") ?? "";

  const rows = await withRLS(authUserId, async (tx) => {
    const [clients, serviceTypes] = await Promise.all([
      tx.client.findMany({ where: { organizationId: appUser.organizationId } }),
      tx.serviceType.findMany({ where: { organizationId: appUser.organizationId } }),
    ]);
    // A client can be identified three ways in the wild: short name, full
    // name, or the master sheet's CLI-### reference. Accept all of them
    // rather than making people transform the file first.
    const clientLookup = new Map<string, (typeof clients)[number]>();
    for (const c of clients) {
      clientLookup.set(c.shortName.toLowerCase(), c);
      clientLookup.set(c.name.toLowerCase(), c);
      if (c.reference) clientLookup.set(c.reference.toLowerCase(), c);
    }
    const serviceTypeByCode = new Map(serviceTypes.map((s) => [s.code.toLowerCase(), s]));
    const defaultServiceType =
      serviceTypes.find((s) => s.code.toUpperCase() === "R-S") ?? serviceTypes[0];

    return records.map((raw, i): PreviewRow => {
      const rowNumber = i + 1;

      const clientValue = field(raw, "client").trim();
      const descriptionValue =
        field(raw, "description").trim() || field(raw, "rawVoiceInput").trim();
      const dateValue = field(raw, "date").trim();
      const hoursValue = field(raw, "durationHours").trim();

      if (!clientValue || !descriptionValue || !dateValue || !hoursValue) {
        return {
          rowNumber,
          raw,
          resolved: null,
          error: "Couldn't find a date, client, description and hours in this row",
        };
      }

      const client = clientLookup.get(clientValue.toLowerCase());
      if (!client) {
        return { rowNumber, raw, resolved: null, error: `Unknown client "${clientValue}"` };
      }

      // The service type is inferable and often absent from an export, so a
      // missing one defaults rather than failing the row -- it's the one field
      // a person can correct afterwards without losing the entry.
      const codeValue = field(raw, "serviceType").trim();
      const serviceType = codeValue
        ? serviceTypeByCode.get(codeValue.toLowerCase())
        : defaultServiceType;
      if (!serviceType) {
        return { rowNumber, raw, resolved: null, error: `Unknown service type "${codeValue}"` };
      }

      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) {
        return { rowNumber, raw, resolved: null, error: `Unparseable date "${dateValue}"` };
      }
      const hours = Number(hoursValue);
      if (Number.isNaN(hours) || hours <= 0) {
        return { rowNumber, raw, resolved: null, error: `Unparseable hours "${hoursValue}"` };
      }
      const statusValue = field(raw, "billableStatus").trim();
      const billableStatus = statusValue
        ? BILLABLE_STATUS_ALIASES[statusValue.toLowerCase()]
        : "Billable";
      if (!billableStatus) {
        return {
          rowNumber,
          raw,
          resolved: null,
          error: `Unrecognized billable status "${statusValue}"`,
        };
      }

      const minimum = Number(serviceType.billingMinimumHours);
      const durationHours = Math.max(hours, minimum);

      const resolved: ResolvedImportRow = {
        clientId: client.id,
        serviceTypeId: serviceType.id,
        date: date.toISOString().slice(0, 10),
        durationHours,
        description: descriptionValue,
        billableStatus,
      };
      return { rowNumber, raw, resolved, error: null };
    });
  });

  return { ok: true, rows, validCount: rows.filter((r) => r.resolved !== null).length };
}

export type CommitResult = { ok: true; created: number } | { ok: false; error: string };

/**
 * Bulk-inserts only the already-resolved rows the preview step produced.
 * Re-validates and re-verifies every id server-side rather than trusting the
 * round trip -- same principle as invoice generation's re-verification of a
 * submitted selection.
 */
export async function commitTimeEntryImport(rows: ResolvedImportRow[]): Promise<CommitResult> {
  if (rows.length === 0) return { ok: false, error: "Nothing to import." };
  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `Import at most ${MAX_ROWS} rows at a time.` };
  }

  const validRows: ResolvedImportRow[] = [];
  for (const r of rows) {
    const parsed = resolvedImportRowSchema.safeParse(r);
    if (!parsed.success) {
      return { ok: false, error: "One or more rows failed validation. Reload and try again." };
    }
    validRows.push(parsed.data);
  }

  const { authUserId, appUser } = await requireOrgContext();

  try {
    await withRLS(authUserId, async (tx) => {
      const clientIds = [...new Set(validRows.map((r) => r.clientId))];
      const serviceTypeIds = [...new Set(validRows.map((r) => r.serviceTypeId))];
      const [validClients, validServiceTypes] = await Promise.all([
        tx.client.findMany({
          where: { id: { in: clientIds }, organizationId: appUser.organizationId },
        }),
        tx.serviceType.findMany({
          where: { id: { in: serviceTypeIds }, organizationId: appUser.organizationId },
        }),
      ]);
      const validClientIds = new Set(validClients.map((c) => c.id));
      const validServiceTypeIds = new Set(validServiceTypes.map((s) => s.id));
      if (
        validRows.some(
          (r) => !validClientIds.has(r.clientId) || !validServiceTypeIds.has(r.serviceTypeId),
        )
      ) {
        throw new Error("One or more rows reference a client or service type that no longer exists.");
      }

      await tx.timeEntry.createMany({
        data: validRows.map((r) => ({
          organizationId: appUser.organizationId,
          clientId: r.clientId,
          serviceTypeId: r.serviceTypeId,
          date: new Date(r.date),
          durationHours: r.durationHours,
          description: r.description,
          billableStatus: r.billableStatus,
          loggedByUserId: appUser.id,
          // An import carries no per-row attribution, so the work is
          // credited to whoever ran it -- editable afterwards on the entry.
          performedByUserId: appUser.id,
          source: "CsvImport",
        })),
      });
    });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/time-entries");
  return { ok: true, created: validRows.length };
}

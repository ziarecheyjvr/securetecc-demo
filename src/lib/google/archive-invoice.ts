import { getGoogleAccessToken, isGoogleConfigured } from "./auth";
import { ensureInvoiceFolder, uploadToDrive, DRIVE_SCOPE } from "./drive";
import { SHEETS_SCOPE } from "./sheets";
import type { InvoicePdfData } from "@/lib/pdf/types";
import { formatDate } from "@/lib/pdf/summary";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export type ArchiveResult =
  | { ok: true; folderId: string; pdfLink: string; sheetLink: string }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

/**
 * Archives a generated invoice to Drive as both a PDF and a formatted Sheet.
 *
 * NEVER throws: archiving is a convenience, and an invoice that exists and
 * bills correctly must not be rolled back because Drive was unreachable.
 * Callers surface a warning instead -- the same posture as the post-commit
 * PDF render in invoices/actions.ts.
 */
export async function archiveInvoiceToDrive(args: {
  invoiceNumber: string;
  clientName: string;
  year: number;
  pdf: Buffer;
  data: InvoicePdfData;
}): Promise<ArchiveResult> {
  if (!isGoogleConfigured()) return { ok: false, skipped: true };

  try {
    // Both scopes in one token -- Google accepts a space-delimited list, and
    // one round trip beats two.
    const token = await getGoogleAccessToken(`${DRIVE_SCOPE} ${SHEETS_SCOPE}`);
    const folderId = await ensureInvoiceFolder(args.clientName, args.year, token);

    // "MWA-00002 - Muller Worthy Architects" -- matching how the previous
    // system named these. The client folder already implies the client, but
    // the files get downloaded and emailed out of that context, and every
    // invoice already in Drive follows this shape.
    const archiveName = `${args.invoiceNumber} - ${args.clientName}`;

    const pdfUpload = await uploadToDrive({
      name: `${archiveName}.pdf`,
      mimeType: "application/pdf",
      content: args.pdf,
      folderId,
      token,
    });

    const sheetLink = await createInvoiceSheet(archiveName, args.data, folderId, token);

    return { ok: true, folderId, pdfLink: pdfUpload.webViewLink, sheetLink };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : "Drive archiving failed.",
    };
  }
}

/**
 * Creates the spreadsheet, then moves it into the target folder.
 *
 * Two steps because the Sheets create endpoint has no `parents` field --
 * a new spreadsheet always lands in My Drive root and has to be relocated
 * through Drive afterwards.
 */
/**
 * Template spreadsheet the archived Sheet is a copy of.
 *
 * The Sheet copy used to be BUILT -- a blank spreadsheet with the layout
 * reconstructed row by row. That can only ever approximate the real thing:
 * merges, Montserrat, the borders, row heights and the dragon watermark were
 * all being rebuilt from a description of the template rather than being the
 * template. Copying the file and filling in the cells makes the archived Sheet
 * identical by construction, and deletes most of the code that tried.
 */
const INVOICE_TEMPLATE_ID =
  process.env.GOOGLE_INVOICE_TEMPLATE_ID ?? "1KphwPrVK5I_r41GDBBK3v1T6kyECgJFzS8qGBEqcl54";

/** First and last row of the template's line-item grid (rows 14-31). */
const FIRST_ITEM_ROW = 14;
const TEMPLATE_ITEM_ROWS = 18;

async function createInvoiceSheet(
  title: string,
  data: InvoicePdfData,
  folderId: string,
  token: string,
): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 1. Copy the template straight into the client/year folder.
  const copied = await fetch(
    `https://www.googleapis.com/drive/v3/files/${INVOICE_TEMPLATE_ID}/copy?fields=id`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: title, parents: [folderId] }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!copied.ok) throw new Error(`Template copy ${copied.status}: ${await copied.text()}`);
  const spreadsheetId = ((await copied.json()) as { id: string }).id;

  // 2. Find the "Invoice" tab's sheetId -- the copy gets fresh ids.
  const meta = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
    { headers, signal: AbortSignal.timeout(30_000) },
  );
  if (!meta.ok) throw new Error(`Sheets meta ${meta.status}: ${await meta.text()}`);
  const sheets = ((await meta.json()) as { sheets: { properties: { sheetId: number; title: string } }[] }).sheets;
  const sheetId = (sheets.find((s) => s.properties.title === "Invoice") ?? sheets[0]).properties.sheetId;

  // 3. Make room if this invoice has more lines than the template's 18.
  const { rows, dividerRows } = buildTemplateRows(data);
  const extraRows = Math.max(0, rows.length - TEMPLATE_ITEM_ROWS);
  if (extraRows > 0) {
    const inserted = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: FIRST_ITEM_ROW + TEMPLATE_ITEM_ROWS - 1,
                endIndex: FIRST_ITEM_ROW + TEMPLATE_ITEM_ROWS - 1 + extraRows,
              },
              // Copy the grid's borders/format onto the new rows.
              inheritFromBefore: true,
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!inserted.ok) throw new Error(`Row insert ${inserted.status}: ${await inserted.text()}`);
  }

  // 4. Fill the cells the template leaves blank. Totals sit below the grid, so
  //    their row moves down by however many rows were inserted above them.
  const totalsBase = 32 + extraRows;
  const org = data.organization;
  const clientLines = [
    "Attn: Accounting Department",
    [data.client.address1, data.client.address2].filter(Boolean).join(", "),
    data.client.cityStateZip,
    data.client.phone,
  ].filter((l): l is string => Boolean(l && l.length));

  const values: { range: string; values: (string | number | null)[][] }[] = [
    { range: "Invoice!A3", values: [[org.billerName ?? org.name]] },
    { range: "Invoice!A4", values: [[buildAddressBlock(org)]] },
    { range: "Invoice!E3", values: [[formatDate(data.issuedAt)]] },
    { range: "Invoice!E4", values: [[data.invoiceNumber]] },
    { range: "Invoice!E6", values: [[org.invoiceForLabel]] },
    { range: "Invoice!E8", values: [[data.client.name], ...clientLines.map((l) => [l])] },
    { range: `Invoice!A${FIRST_ITEM_ROW}`, values: rows },
    { range: `Invoice!E${totalsBase}`, values: [[data.totalAmount]] },
    { range: `Invoice!E${totalsBase + 4}`, values: [[data.totalAmount]] },
  ];

  const written = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: values }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!written.ok) throw new Error(`Values write ${written.status}: ${await written.text()}`);

  // 5. Charge-group dividers span the grid in the PDF; merge them here too.
  const merges = dividerRows
    .map((offset) => FIRST_ITEM_ROW + offset)
    .map((row) => ({
      mergeCells: {
        range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: 0, endColumnIndex: 4 },
        mergeType: "MERGE_ALL",
      },
    }));
  if (merges.length > 0) {
    await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requests: merges }),
      signal: AbortSignal.timeout(30_000),
    });
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

/** The template's A4 cell is one merged block holding the whole address. */
export function buildAddressBlock(org: InvoicePdfData["organization"]): string {
  return [
    org.billerAddress1,
    org.billerAddress2,
    org.billerCityStateZip,
    org.officePhone ? `Office: ${org.officePhone}` : null,
    org.mobilePhone ? `Mobile: ${org.mobilePhone}` : null,
    org.billerEmail ? `Email: ${org.billerEmail}` : null,
    org.website ? `Website: ${org.website}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Grid rows in the template's own A-E order, padded to its 18.
 *
 * Divider positions come back separately rather than as a marker column: the
 * rows array is sent to the API verbatim, so anything extra in it would have
 * to be stripped first -- and stripping it before the merge step reads it is
 * exactly the bug that produced unmerged dividers.
 */
export function buildTemplateRows(data: InvoicePdfData): {
  rows: (string | number)[][];
  dividerRows: number[];
} {
  const rows: (string | number)[][] = [];
  const dividerRows: number[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < data.lineItems.length; i++) {
    const item = data.lineItems[i];
    const previous = i > 0 ? data.lineItems[i - 1].groupLabel : null;
    if (item.groupLabel && item.groupLabel !== previous && !seen.has(item.groupLabel)) {
      seen.add(item.groupLabel);
      dividerRows.push(rows.length);
      rows.push([`— ${item.groupLabel} —`, "", "", "", 0]);
    }
    rows.push([
      item.date ? formatDate(item.date) : "",
      item.serviceCode ? `${item.serviceCode} — ${item.description}` : item.description,
      item.hours ?? "",
      item.rate ?? "",
      item.amount ?? 0,
    ]);
  }
  while (rows.length < TEMPLATE_ITEM_ROWS) rows.push(["", "", "", "", 0]);
  return { rows, dividerRows };
}


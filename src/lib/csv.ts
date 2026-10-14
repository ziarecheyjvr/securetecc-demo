/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas and
 * newlines within quotes, doubled-quote escaping, and a BOM/CRLF-tolerant
 * pre-pass. Header row keys are lowercased and stripped of whitespace/
 * underscores so "Client Short Name" / "client_short_name" / "clientShortName"
 * all resolve to the same key.
 *
 * Shared by `scripts/migrate-from-sheets.mts` (the one-time historical
 * import) and the persistent CSV-import UI
 * (`src/app/(app)/time-entries/import-actions.ts`), so the two paths can't
 * silently drift apart on parsing behavior.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];

  const keys = header.map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, ""));
  return body.map((cols) => {
    const record: Record<string, string> = {};
    keys.forEach((k, i) => (record[k] = (cols[i] ?? "").trim()));
    return record;
  });
}

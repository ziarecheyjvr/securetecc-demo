import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Works out which CSV column means what, so an import doesn't depend on the
 * spreadsheet using our header names.
 *
 * The master sheet calls things ClientID/DurationHours/LoggedBy; an export
 * from somewhere else will call them something different again. Rather than
 * make people rename columns before uploading, the headers and a few sample
 * rows go to Gemini, which returns a mapping onto the fields we need.
 *
 * Only the MAPPING is delegated -- the values themselves are never
 * interpreted by the model. Rows are still parsed, resolved against real
 * clients and service types, and validated server-side exactly as before, so
 * a wrong guess here surfaces as an unresolved row in the preview rather than
 * as bad data in the database.
 */
export type CsvFieldMapping = {
  date: string | null;
  description: string | null;
  durationHours: string | null;
  client: string | null;
  serviceType: string | null;
  billableStatus: string | null;
  rawVoiceInput: string | null;
};

const FIELD_NOTES: Record<keyof CsvFieldMapping, string> = {
  date: "the date the work was performed",
  description: "what work was done",
  durationHours: "how long it took, in hours (a number)",
  client: "which client — may be a name (ClientName) or a reference like CLI-016 (ClientID)",
  serviceType: "the service type code, e.g. R-S, P-S, O-S, L-V, W-D, A-I",
  billableStatus: "Billable / Non-Billable / Residual",
  rawVoiceInput: "the original dictated note, if the sheet keeps one",
};

/** Header names we can resolve without asking the model. */
const DIRECT: Record<keyof CsvFieldMapping, string[]> = {
  date: ["date", "entrydate", "workdate"],
  description: ["description", "notes", "work", "details"],
  durationHours: ["durationhours", "hours", "duration", "time"],
  client: ["clientshortname", "clientname", "client", "clientid"],
  serviceType: ["servicetypecode", "servicetype", "service", "type", "code"],
  billableStatus: ["billablestatus", "billable", "status"],
  rawVoiceInput: ["rawvoiceinput", "rawinput", "voicenote"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header matching that needs no AI. Returns null for anything unresolved. */
export function mapByName(headers: string[]): CsvFieldMapping {
  const mapping = {} as CsvFieldMapping;
  for (const field of Object.keys(DIRECT) as (keyof CsvFieldMapping)[]) {
    const match = headers.find((h) => DIRECT[field].includes(norm(h)));
    mapping[field] = match ?? null;
  }
  return mapping;
}

/**
 * Fills in whatever mapByName couldn't resolve.
 *
 * Returns the name-based mapping unchanged when every required field is
 * already known, or when GEMINI_API_KEY isn't set -- the import must keep
 * working without AI configured, just with stricter header requirements.
 */
export async function mapCsvColumns(
  headers: string[],
  sampleRows: Record<string, string>[],
): Promise<{ mapping: CsvFieldMapping; usedAi: boolean }> {
  const byName = mapByName(headers);
  const required: (keyof CsvFieldMapping)[] = ["date", "description", "durationHours", "client"];
  const missing = required.filter((f) => !byName[f]);

  if (missing.length === 0) return { mapping: byName, usedAi: false };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { mapping: byName, usedAi: false };

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const fieldList = (Object.keys(FIELD_NOTES) as (keyof CsvFieldMapping)[])
    .map((f) => `- "${f}": ${FIELD_NOTES[f]}`)
    .join("\n");

  const prompt = `You are mapping the columns of a time-tracking CSV onto a known set of fields.

CSV column headers: ${JSON.stringify(headers)}

First rows of data:
${JSON.stringify(sampleRows.slice(0, 3), null, 1)}

Map each field below to the CSV header that holds it, or null if the CSV has no such column:
${fieldList}

Return ONLY a JSON object whose keys are the field names above and whose values are
either an exact string from the CSV column headers or null. Do not invent header
names — every non-null value must appear in the headers array verbatim.`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text()) as Partial<Record<string, unknown>>;

    const merged = { ...byName };
    for (const field of Object.keys(FIELD_NOTES) as (keyof CsvFieldMapping)[]) {
      if (merged[field]) continue; // a confident name match beats a guess
      const value = parsed[field];
      // Only accept a header the file actually has; a hallucinated name would
      // otherwise read as an all-blank column.
      if (typeof value === "string" && headers.includes(value)) merged[field] = value;
    }
    return { mapping: merged, usedAi: true };
  } catch {
    // A mapping failure is not an import failure: fall back to what the header
    // names alone gave us and let the preview report the unresolved rows.
    return { mapping: byName, usedAi: false };
  }
}

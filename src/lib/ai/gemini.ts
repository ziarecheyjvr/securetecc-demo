import { GoogleGenerativeAI } from "@google/generative-ai";
import { pacificDayStart, PACIFIC_TZ } from "@/lib/cron/pacific";
import { buildTimeEntryPrompt, type ServiceTypeForPrompt } from "./time-entry-prompt";

/** A physical part or material mentioned in the note, billed as a flat cost. */
export type RawParsedMaterial = { cost: number; description: string };

export type RawParsedTimeEntry = {
  clientShortName: string;
  durationHours: number;
  description: string;
  date: string;
  billableStatus: "Billable" | "Non-Billable" | "Residual";
  billingRate: number | null;
  /** Absent when the note mentioned no material costs. */
  materials?: RawParsedMaterial[];
};

export async function parseTimeEntryWithGemini({
  orgName,
  rawInput,
  clientShortNames,
  serviceTypes,
}: {
  orgName: string;
  rawInput: string;
  clientShortNames: string[];
  serviceTypes: ServiceTypeForPrompt[];
}): Promise<RawParsedTimeEntry> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  // Anchored to the ORG's day, not the server's: without this Gemini dates
  // "today" from its own training-time notion of now, which is stale.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(pacificDayStart());

  const prompt = buildTimeEntryPrompt({ orgName, rawInput, clientShortNames, serviceTypes, today });

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The AI parser returned something that wasn't valid JSON. Try rephrasing.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("clientShortName" in parsed) ||
    !("durationHours" in parsed) ||
    !("description" in parsed)
  ) {
    throw new Error("The AI parser response was missing required fields.");
  }

  const entry = parsed as RawParsedTimeEntry;

  // Gemini is asked to omit `materials` entirely when none were mentioned, but
  // a model will occasionally send null or a malformed entry anyway. Drop
  // anything that isn't a usable {cost, description} pair rather than letting
  // a NaN reach the expense row.
  if (Array.isArray(entry.materials)) {
    entry.materials = entry.materials.filter(
      (m): m is RawParsedMaterial =>
        !!m && typeof m.cost === "number" && Number.isFinite(m.cost) && m.cost > 0 && !!m.description,
    );
    if (entry.materials.length === 0) delete entry.materials;
  } else {
    delete entry.materials;
  }

  return entry;
}

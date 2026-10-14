import { GoogleGenerativeAI } from "@google/generative-ai";
import { pacificDayStart, PACIFIC_TZ } from "@/lib/cron/pacific";
import { buildTaskPrompt, type StaffForPrompt } from "./task-prompt";

export type RawParsedTask = {
  title: string;
  description: string | null;
  assigneeName: string | null;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
};

export async function parseTaskWithGemini({
  orgName,
  rawInput,
  staff,
}: {
  orgName: string;
  rawInput: string;
  staff: StaffForPrompt[];
}): Promise<RawParsedTask> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  // Anchored to the ORG's day, not the server's: production runs in UTC, so
  // after 5pm Pacific "today" has already rolled over and every evening
  // "by tomorrow" would land a day late.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(pacificDayStart());

  const result = await model.generateContent(buildTaskPrompt({ orgName, rawInput, staff, today }));

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.response.text());
  } catch {
    throw new Error("The AI parser returned something that wasn't valid JSON. Try rephrasing.");
  }

  if (typeof parsed !== "object" || parsed === null || !("title" in parsed)) {
    throw new Error("The AI parser response was missing a task title.");
  }

  return parsed as RawParsedTask;
}

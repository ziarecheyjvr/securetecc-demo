"use server";

import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { parseTimeEntryWithGemini, type RawParsedMaterial } from "@/lib/ai/gemini";
import { pacificDayStart, PACIFIC_TZ } from "@/lib/cron/pacific";
import type { TimeEntryFormValues } from "@/lib/validations/time-entry";

export type AiParseResult =
  | {
      ok: true;
      values: Partial<TimeEntryFormValues>;
      /** Parts/materials mentioned in the note, to be logged as reimbursables. */
      materials?: RawParsedMaterial[];
      warning?: string;
    }
  | { ok: false; error: string };

// Parses a voice/text note into draft time-entry fields for the technician to
// review and correct before saving -- this never writes to the database
// itself. See lib/ai/time-entry-prompt.ts for why the underlying prompt looks
// the way it does.
export async function parseTimeEntryVoiceNote(rawInput: string): Promise<AiParseResult> {
  if (!rawInput.trim()) {
    return { ok: false, error: "Enter a description of the work first." };
  }

  const { authUserId, appUser } = await requireOrgContext();

  const [clients, serviceTypes] = await withRLS(authUserId, (tx) =>
    Promise.all([
      tx.client.findMany({
        where: { activeStatus: true },
        select: { id: true, shortName: true },
      }),
      tx.serviceType.findMany({
        select: { id: true, code: true, label: true, billingMinimumHours: true, rateOverride: true },
      }),
    ]),
  );

  if (clients.length === 0) {
    return { ok: false, error: "Add at least one client before using AI-assisted entry." };
  }
  if (serviceTypes.length === 0) {
    return { ok: false, error: "Add at least one service type before using AI-assisted entry." };
  }

  let parsed;
  try {
    parsed = await parseTimeEntryWithGemini({
      orgName: appUser.organization.name,
      rawInput,
      clientShortNames: clients.map((c) => c.shortName),
      serviceTypes: serviceTypes.map((st) => ({
        code: st.code,
        label: st.label,
        billingMinimumHours: Number(st.billingMinimumHours),
        rateOverride: st.rateOverride ? Number(st.rateOverride) : null,
      })),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI parsing failed." };
  }

  let warning: string | undefined;

  const matchedClient = clients.find(
    (c) => c.shortName.toLowerCase() === parsed.clientShortName?.toLowerCase(),
  );
  if (!matchedClient) {
    warning = `Couldn't match client "${parsed.clientShortName}" -- select it manually.`;
  }

  // The service type isn't a separate JSON field; the prompt requires the
  // model to prefix the description with the matched code, e.g. "R-S — did
  // the thing". Recover the code from that prefix and strip it back out so
  // the review form's description field shows clean prose.
  const prefixMatch = /^([A-Za-z0-9-]+)\s*[—-]\s*([\s\S]*)$/.exec(parsed.description ?? "");
  let matchedServiceTypeId: string | undefined;
  let cleanDescription = parsed.description ?? "";

  if (prefixMatch) {
    const [, code, rest] = prefixMatch;
    const matchedServiceType = serviceTypes.find(
      (st) => st.code.toLowerCase() === code.toLowerCase(),
    );
    if (matchedServiceType) {
      matchedServiceTypeId = matchedServiceType.id;
      cleanDescription = rest.trim();
    }
  }
  if (!matchedServiceTypeId) {
    warning = warning
      ? `${warning} Also couldn't determine the service type -- select it manually.`
      : "Couldn't determine the service type -- select it manually.";
  }

  const date = resolveParsedDate(parsed.date);
  const billableStatus =
    parsed.billableStatus === "Non-Billable"
      ? "NonBillable"
      : parsed.billableStatus === "Residual"
        ? "Residual"
        : "Billable";

  return {
    ok: true,
    warning,
    values: {
      clientId: matchedClient?.id,
      serviceTypeId: matchedServiceTypeId,
      date,
      durationHours: typeof parsed.durationHours === "number" ? parsed.durationHours : undefined,
      description: cleanDescription,
      billableStatus,
    },
    materials: parsed.materials,
  };
}

/**
 * Resolves the model's date word against the ORG's day, not the server's.
 *
 * `new Date().toISOString()` is UTC, and production runs in UTC: after 5pm
 * Pacific the UTC date has already rolled over, so "today" resolved to
 * tomorrow and every evening voice note was filed a day late.
 */
function resolveParsedDate(value: string | undefined): string {
  const toISODate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(d);
  const today = pacificDayStart();

  if (!value || value.toLowerCase() === "today") return toISODate(today);
  if (value.toLowerCase() === "yesterday") {
    return toISODate(new Date(today.getTime() - 12 * 3_600_000));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return toISODate(today);
}

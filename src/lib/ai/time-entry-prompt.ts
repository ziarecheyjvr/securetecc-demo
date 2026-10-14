/**
 * AI-assisted time-entry parsing prompt.
 *
 * This is a faithful port of the proven production prompt (see AGENTS.md
 * Appendix A) -- it went through multiple real iterations to fix an actual
 * misclassification bug: entries with no explicit keyword ("remote", "phone",
 * etc.) were silently coming through with no service type tag at all. The
 * "always classify, infer from context using these defaults" rules below are
 * that fix. Do not simplify this back down to "only tag if a keyword is
 * present" -- that's the exact regression this prompt exists to prevent.
 *
 * The only thing that changes per organization is the acronym/minimum/rate
 * table and the client alias list, both built dynamically from that org's
 * ServiceType and Client rows. The behavioral rules stay fixed and org-agnostic.
 */

export type ServiceTypeForPrompt = {
  code: string;
  label: string;
  billingMinimumHours: number;
  rateOverride: number | null;
};

export function buildTimeEntryPrompt({
  orgName,
  rawInput,
  clientShortNames,
  serviceTypes,
  today,
}: {
  orgName: string;
  rawInput: string;
  clientShortNames: string[];
  serviceTypes: ServiceTypeForPrompt[];
  /** YYYY-MM-DD in the org's timezone. See the date block in the prompt. */
  today: string;
}): string {
  const serviceTypeTable = serviceTypes
    .map(
      (st) =>
        `- ${st.code} = ${st.label} (${st.billingMinimumHours} hr minimum${
          st.rateOverride ? `, $${st.rateOverride}/hr — SPECIAL RATE` : ""
        })`,
    )
    .join("\n");

  const overrideCodes = serviceTypes.filter((st) => st.rateOverride !== null);
  const overrideRule = overrideCodes.length
    ? overrideCodes
        .map((st) => `If the service type is ${st.label} (${st.code}), set billingRate to ${st.rateOverride}.`)
        .join(" ")
    : "";

  // Quotes in the transcript would terminate the quoted Voice note field early
  // and let its contents read as prompt instructions.
  const safeInput = rawInput.replace(/"/g, "'");

  return `You are a time tracking assistant for ${orgName}. Extract data from this voice note and return ONLY a JSON object with no other text.

Today's actual date is ${today} — use this as your only source of truth for "today", "yesterday", and any date math. Do not rely on your own internal sense of the current date, which may be outdated.

Voice note: "${safeInput}"

Known client aliases (use one of these exactly for clientShortName): ${clientShortNames.join(", ")}

SERVICE TYPE ACRONYMS, BILLING MINIMUMS, AND RATES:
${serviceTypeTable}
- Travel — billed at Tony's discretion (no fixed minimum)

You MUST always classify the entry with exactly one of these acronyms — never leave it untagged. Use explicit keywords when present (remote, phone call, email, on-site, in person, low voltage, website development, AI automation, travel). When no keyword is stated, infer the most likely service type from context using these defaults:
- Troubleshooting, fixing, checking, or configuring a computer, network, printer, account, or software issue with no mention of traveling to a location or being physically present = R-S (Remote Service) — this is the default for most IT work unless another type is clearly indicated.
- A call or conversation with no video/screen-share mentioned = P-S (Phone Service).
- A hosted video call, Google Meet, Teams meeting, or Zoom = R-S (Remote Service).
- Explicit mention of driving to, visiting, or being physically at a client site = O-S (On-Site Service).
- Structured cabling, cameras, access control, or AV installation = L-V (Low Voltage).
- Building, designing, or coding a website, landing page, or web app = W-D (Website Development).
- Building AI agents, chatbots, automation workflows, integrations, or AI-related tooling/scripting = A-I (AI Automation).

Apply the matching acronym's billing minimum: if the stated/calculated hours are below that service type's minimum, round UP to the minimum.

SPECIAL RATE SERVICE TYPES: ${overrideRule} For all other service types, omit the billingRate field.

In the description field, always prefix the work description with the acronym exactly like this format: "R-S — [description]" or "L-V — [description]" etc. Every entry must have this prefix — there is no case where it should be omitted.

IMPORTANT — CLEANING THE DESCRIPTION: Voice transcription often mishears words, especially client names (e.g. "your on the lake" instead of "Yar On The Lake", "AMS craig" instead of "AMS Craig"). The description should describe the WORK PERFORMED only — do NOT include the client name in the description (it is already captured separately in clientShortName), and do NOT repeat misheard/garbled phrases. Rewrite the description in clear, professional language describing only the task completed.

MATERIAL / PART COST DETECTION (reimbursable expenses): Voice notes sometimes mention one or more physical materials, parts, or supplies that were purchased or used, each with a dollar cost attached — e.g. "used 2 meters of wire which cost $100", "installed a $45 connector and a $30 mounting bracket". A single voice note can mention MULTIPLE separate materials — extract each one as its own entry in the materials array. Do NOT confuse this with the hourly billing rate — a material cost is a separate one-time dollar amount for a physical item, not a rate per hour. If no material/part cost is mentioned, omit the materials field entirely (do not include it as an empty array or null — just leave it out of the JSON).

Return this exact JSON structure (materials is optional — only include when one or more material costs were mentioned):
{"clientShortName":"alias","durationHours":1.0,"description":"work done","date":"today","billableStatus":"Billable","billingRate":null,"materials":[{"cost":100,"description":"2 meters of wire"}]}

Rules:
- durationHours is a number (90 minutes = 1.5), after applying the billing minimum if applicable
- billableStatus is exactly Billable, Non-Billable, or Residual
- billingRate is the special rate for override service types, null for everything else
- description is under 100 characters, including the required acronym prefix
- DATE HANDLING (use today's actual date above, not your own assumption):
  - No date mentioned = "today"
  - "yesterday" mentioned = use the literal word "yesterday"
  - A specific day mentioned WITH a year (e.g. "March 3rd 2025") = use that exact YYYY-MM-DD
  - A specific day mentioned WITHOUT a year (e.g. "July 25th", "the 3rd") = assume the CURRENT year from today's actual date above, unless that would place the date in the future relative to today — in that case use the previous year instead. Never default to a year from your own training data.
  - Return YYYY-MM-DD format for any specific date, never a timestamp or number
- clientShortName must match one of the known client aliases
- each materials[].cost is a plain number (no $ sign); each materials[].description is under 60 characters
- if no material/part cost is mentioned anywhere in the note, omit the materials field entirely
- Return ONLY the JSON, nothing else`;
}

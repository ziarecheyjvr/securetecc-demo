/**
 * AI-assisted task-dictation prompt.
 *
 * Tony dictates the way he would say it out loud -- "get Zia to reconcile the
 * July invoices by Friday, it's urgent" -- and this turns that into the
 * fields the task form actually has. It is deliberately narrow: it writes a
 * title, tidies the brief, picks an assignee from a known list, and reads a
 * date. It does not invent scope, and it never decides that something is
 * urgent on its own -- an unstated priority comes back as Medium, because a
 * model guessing "Urgent" would train everyone to ignore the flag.
 *
 * Modelled on lib/ai/time-entry-prompt.ts, including the date rules, which
 * exist there because a model left to itself dates things from its own
 * training-time notion of "now".
 */

export type StaffForPrompt = { name: string; isSelf: boolean };

export function buildTaskPrompt({
  orgName,
  rawInput,
  staff,
  today,
}: {
  orgName: string;
  rawInput: string;
  /** Everyone a task can be assigned to, with the speaker marked. */
  staff: StaffForPrompt[];
  /** YYYY-MM-DD in the org's timezone. */
  today: string;
}): string {
  const roster = staff
    .map((s) => `- ${s.name}${s.isSelf ? " (this is the speaker — 'me', 'myself', 'I')" : ""}`)
    .join("\n");

  return `You convert a spoken note into a delegated task for ${orgName}, an IT services company.

Today's actual date is ${today}. Use it for every date calculation. Do not use any other notion of the current date.

The note was dictated and passed through speech-to-text, so expect misheard words, filler ("um", "okay so"), and self-corrections ("actually make that Friday"). Honour the LAST instruction when the speaker corrects themselves.

PEOPLE this task can be assigned to:
${roster}

Voice transcription mangles names constantly ("Xia"/"Zia", "Ian"/"in"/"e-n", "Tony"/"Tonny"). Match phonetically to the roster above. Only return a name that appears in the roster, spelled exactly as it appears there. If nobody is named, or you cannot tell who is meant, return null.

The note is dictated BY the speaker. "I need to...", "remind me to...", "my task" all mean the speaker is the assignee.

Return this exact JSON structure:
{"title":"Reconcile the July invoices","description":"Cross-check the July invoices against the master sheet and flag any mismatches.","assigneeName":"Zia","priority":"Medium","startDate":null,"dueDate":"2026-09-05"}

Rules:
- title is a short imperative instruction, under 80 characters, with no name, no date and no priority word in it — those are separate fields. Start with a verb.
- description is the fuller brief in clean professional prose: what to do, and any detail, constraint or context the speaker gave. Fix transcription errors and drop filler. Do NOT invent requirements, deadlines, or steps that were not said. If the note says nothing beyond the title, return null.
- assigneeName is exactly one name from the roster, or null.
- priority is exactly one of Low, Medium, High, Urgent. Use what was said ("urgent", "when you get a chance" = Low, "high priority", "asap" = Urgent). If priority was NOT mentioned, return "Medium" — never infer urgency from the subject matter.
- DATE HANDLING (use today's actual date above, not your own assumption):
  - No date mentioned = null
  - "today" = today's date; "tomorrow" = the day after today
  - A weekday ("by Friday", "next Monday") = the NEXT such weekday strictly after today
  - "end of the week" = the coming Friday; "end of the month" = the last day of the current month
  - "in three days", "in two weeks" = counted from today
  - A specific day WITHOUT a year = the current year, unless that puts it in the past relative to today, in which case use the next year
  - Always return YYYY-MM-DD, never a timestamp, weekday name or phrase
- startDate is only set if the speaker said when work should BEGIN ("start on Monday"). Otherwise null.
- dueDate is when it must be finished. A single date mentioned with no other framing is the dueDate, not the startDate.
- If a startDate and dueDate are both present, the startDate must not be after the dueDate.
- Return ONLY the JSON, nothing else.

The dictated note:
"""
${rawInput}
"""`;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import {
  timeEntryFormSchema,
  type TimeEntryFormValues,
  BILLABLE_STATUS_LABELS,
} from "@/lib/validations/time-entry";
import { createTimeEntry } from "@/app/(app)/time-entries/actions";
import { parseTimeEntryVoiceNote } from "@/app/(app)/time-entries/ai-actions";
import { LISTENING_PLACEHOLDER, useDictation } from "@/lib/hooks/use-dictation";

/**
 * Standalone branded page ported from manage.securetecc.com's v1 Voice
 * Logger (github.com/securetecc/manage, operations/index.html) -- same
 * header/card chrome, tabs, mic button, and example-phrase tips. Two
 * differences from the source: real browser speech-to-text feeds our
 * existing Gemini parser (parseTimeEntryVoiceNote) instead of a PHP proxy to
 * Apps Script, and there's no "Clients" tab -- that's already covered by
 * /clients in the main app.
 */

export type ClientOption = { id: string; name: string; shortName: string };
export type ServiceTypeOption = {
  id: string;
  code: string;
  label: string;
  billingMinimumHours: number;
  rateOverride: number | null;
};

const EXAMPLE_PHRASES = [
  "Spent 2 hours fixing the VPN at AMS Craig, billable",
  "90 min network setup for Kasco LP today, make it billable",
  "30 minute call with Yar On The Lake, non-billable",
];

const emptyDraft: Partial<TimeEntryFormValues> = {
  clientId: "",
  serviceTypeId: "",
  date: new Date().toISOString().slice(0, 10),
  durationHours: 1,
  description: "",
  billableStatus: "Billable",
  rateOverride: null,
  travelMinutes: null,
  // Whoever is logging it. The server resolves this and never trusts a
  // submitted id it cannot verify.
  performedByUserId: null,
};

export function VoiceLoggerApp({
  clients,
  serviceTypes,
}: {
  clients: ClientOption[];
  serviceTypes: ServiceTypeOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"voice" | "manual">("voice");

  // Voice tab state
  const dictation = useDictation({
    onUnsupported: () => toast.error("Voice input needs Chrome or Safari."),
  });
  const { isRecording, transcript } = dictation;
  const [parsing, setParsing] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Partial<TimeEntryFormValues> | null>(null);
  const [reviewWarning, setReviewWarning] = useState<string | null>(null);

  // Manual tab state
  const [manual, setManual] = useState<Partial<TimeEntryFormValues>>(emptyDraft);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null);

  function resetVoice() {
    dictation.reset();
    setReviewDraft(null);
    setReviewWarning(null);
  }

  function switchTab(next: "voice" | "manual") {
    setTab(next);
    setResult(null);
    if (next === "voice") resetVoice();
    if (next === "manual") setManual(emptyDraft);
  }

  async function handleParseVoice() {
    if (!dictation.hasSpeech) {
      toast.error("Record a voice entry first.");
      return;
    }
    setParsing(true);
    const parsed = await parseTimeEntryVoiceNote(transcript);
    setParsing(false);
    if (!parsed.ok) {
      // Don't discard the dictation. Speaking it again is the expensive part,
      // and a parse failure (missing GEMINI_API_KEY, malformed model JSON, API
      // outage) says nothing about whether the transcript itself is good. Open
      // the review form with the raw text in the description so it can be
      // finished by hand instead of re-recorded.
      toast.error(`${parsed.error} Your recording was kept — fill in the rest manually.`);
      setReviewDraft({ ...emptyDraft, description: transcript.trim() });
      setReviewWarning(
        "AI parsing failed, so nothing was filled in automatically. Your transcript is in " +
          "the description — set the client, service type, and hours yourself.",
      );
      return;
    }
    setReviewDraft({ ...emptyDraft, ...parsed.values });
    setReviewWarning(parsed.warning ?? null);
  }

  async function handleSave(values: Partial<TimeEntryFormValues>, rawInput?: string) {
    const parsedInput = timeEntryFormSchema.safeParse(values);
    if (!parsedInput.success) {
      toast.error(parsedInput.error.issues[0]?.message ?? "Fill in all fields first.");
      return;
    }
    setSubmitting(true);
    const res = await createTimeEntry(parsedInput.data, rawInput);
    setSubmitting(false);

    if (!res.ok) {
      setResult({ ok: false, message: "Couldn't log the entry", detail: res.error });
      return;
    }

    const client = clients.find((c) => c.id === parsedInput.data.clientId);
    setResult({
      ok: true,
      message: "Entry logged successfully",
      detail: `${client?.name ?? ""} · ${parsedInput.data.durationHours} hrs · ${BILLABLE_STATUS_LABELS[parsedInput.data.billableStatus]}`,
    });
    resetVoice();
    setManual(emptyDraft);
    router.refresh();
  }

  const reviewServiceType = serviceTypes.find((st) => st.id === reviewDraft?.serviceTypeId);
  const manualServiceType = serviceTypes.find((st) => st.id === manual.serviceTypeId);

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#050F1D] font-[family-name:var(--font-poppins)] text-white">
      <header className="border-b-2 border-[#06E1DC] bg-[#071E37] px-4 py-4 text-center">
        <Image
          src="/securetecc-logo.png"
          alt="SecureTECC"
          width={1080}
          height={264}
          className="mx-auto h-auto w-full max-w-[220px]"
        />
      </header>

      <div className="mx-auto flex w-full max-w-[480px] flex-1 items-center px-4 py-8 lg:max-w-[640px] lg:py-14">
        <div className="w-full rounded-2xl bg-[#071E37] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)] sm:p-8">
          <div className="mb-6 border-b border-[rgba(6,225,220,0.2)] pb-5 text-center">
            <h1 className="text-xl font-bold sm:text-[22px]">SecureTECC Voice Logger</h1>
            <p className="mt-1 text-sm text-[#06E1DC]">Powered by Gemini AI · Your Trusted IT Partner</p>
          </div>

          <p className="mb-5 text-center text-[15px] leading-relaxed">
            Tap the button, describe your work naturally, and AI will log the time entry
            automatically.
          </p>

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => switchTab("voice")}
              className={`flex-1 rounded-lg border px-3 py-3 text-sm font-bold transition-colors ${
                tab === "voice"
                  ? "border-[#06E1DC] bg-[#06E1DC] text-[#071E37]"
                  : "border-[rgba(6,225,220,0.2)] bg-[rgba(6,225,220,0.05)] text-white hover:border-[rgba(6,225,220,0.5)]"
              }`}
            >
              🎤 Voice Logger
            </button>
            <button
              type="button"
              onClick={() => switchTab("manual")}
              className={`flex-1 rounded-lg border px-3 py-3 text-sm font-bold transition-colors ${
                tab === "manual"
                  ? "border-[#06E1DC] bg-[#06E1DC] text-[#071E37]"
                  : "border-[rgba(6,225,220,0.2)] bg-[rgba(6,225,220,0.05)] text-white hover:border-[rgba(6,225,220,0.5)]"
              }`}
            >
              ⌨️ Manual Entry
            </button>
          </div>

          {tab === "voice" && !reviewDraft && (
            <div className="mb-5 rounded-r-lg border-l-[3px] border-[#06E1DC] bg-[rgba(6,225,220,0.06)] px-4 py-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#06E1DC]">
                💡 Example phrases
              </div>
              {EXAMPLE_PHRASES.map((phrase) => (
                <div key={phrase} className="mb-1 text-[13px] leading-relaxed text-white">
                  &quot;{phrase}&quot;
                </div>
              ))}
            </div>
          )}

          {tab === "voice" && (
            <div>
              {!reviewDraft ? (
                <>
                  <button
                    type="button"
                    onClick={dictation.toggle}
                    className={`mb-4 block w-full rounded-xl px-6 py-5 text-lg font-bold tracking-wide transition-opacity hover:opacity-85 ${
                      isRecording ? "animate-pulse bg-[#ff4444] text-white" : "bg-[#06E1DC] text-[#071E37]"
                    }`}
                  >
                    {isRecording ? "⏹ Stop Recording" : "🎤 Tap to Speak"}
                  </button>

                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#06E1DC]">
                    Transcript
                  </div>
                  <div
                    className={`mb-4 min-h-[90px] rounded-lg border border-[rgba(6,225,220,0.2)] bg-[rgba(6,225,220,0.05)] p-4 text-[15px] leading-relaxed ${
                      transcript ? "text-white" : "italic text-[rgba(255,255,255,0.3)]"
                    }`}
                  >
                    {transcript || "Your spoken text will appear here..."}
                  </div>

                  {transcript && !isRecording && transcript !== LISTENING_PLACEHOLDER && (
                    <button
                      type="button"
                      onClick={handleParseVoice}
                      disabled={parsing}
                      className="mb-3 w-full rounded-lg bg-[#06E1DC] px-6 py-4 text-base font-bold tracking-wide text-[#071E37] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-[#1a3050] disabled:text-[rgba(255,255,255,0.3)]"
                    >
                      {parsing ? "⏳ Parsing…" : "✓ Log This Entry"}
                    </button>
                  )}
                </>
              ) : (
                <div>
                  {reviewWarning && (
                    <p className="mb-3 rounded-lg border border-[rgba(255,68,68,0.4)] bg-[rgba(255,68,68,0.1)] px-3 py-2 text-sm text-[#ff8a8a]">
                      {reviewWarning}
                    </p>
                  )}
                  <VoiceReviewFields
                    draft={reviewDraft}
                    setDraft={setReviewDraft}
                    clients={clients}
                    serviceTypes={serviceTypes}
                  />
                  {reviewServiceType && (
                    <p className="mb-4 -mt-2 text-xs text-[rgba(255,255,255,0.45)]">
                      {reviewServiceType.billingMinimumHours}hr minimum
                      {reviewServiceType.rateOverride
                        ? ` · billed at $${reviewServiceType.rateOverride}/hr`
                        : " · billed at client's standard rate"}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewDraft(null)}
                      className="flex-1 rounded-lg border border-[rgba(6,225,220,0.3)] bg-transparent px-4 py-3 text-sm font-bold text-white transition-colors hover:border-[#06E1DC]"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleSave(reviewDraft, transcript)}
                      className="flex-1 rounded-lg bg-[#06E1DC] px-4 py-3 text-sm font-bold text-[#071E37] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-[#1a3050] disabled:text-[rgba(255,255,255,0.3)]"
                    >
                      {submitting ? "Saving…" : "✓ Confirm & Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "manual" && (
            <div>
              <FieldLabel>Client</FieldLabel>
              <select
                className="vl-field"
                value={manual.clientId ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, clientId: e.target.value }))}
              >
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <FieldLabel>Date</FieldLabel>
              <input
                type="date"
                className="vl-field"
                value={manual.date ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, date: e.target.value }))}
              />

              <FieldLabel>Hours</FieldLabel>
              <input
                type="number"
                step="0.25"
                min="0"
                placeholder="e.g. 2.5"
                className="vl-field"
                value={manual.durationHours ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, durationHours: Number(e.target.value) }))}
              />

              <FieldLabel>Service Type</FieldLabel>
              <select
                className="vl-field"
                value={manual.serviceTypeId ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, serviceTypeId: e.target.value }))}
              >
                <option value="">Select a service type...</option>
                {serviceTypes.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.code} — {st.label}
                  </option>
                ))}
              </select>
              {manualServiceType && (
                <p className="mb-4 -mt-2 text-xs text-[rgba(255,255,255,0.45)]">
                  {manualServiceType.billingMinimumHours}hr minimum
                  {manualServiceType.rateOverride
                    ? ` · billed at $${manualServiceType.rateOverride}/hr`
                    : " · billed at client's standard rate"}
                </p>
              )}

              <FieldLabel>Billable Status</FieldLabel>
              <select
                className="vl-field"
                value={manual.billableStatus ?? "Billable"}
                onChange={(e) =>
                  setManual((m) => ({
                    ...m,
                    billableStatus: e.target.value as TimeEntryFormValues["billableStatus"],
                  }))
                }
              >
                {Object.entries(BILLABLE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <FieldLabel>Description</FieldLabel>
              <textarea
                className="vl-field min-h-[90px] resize-y"
                placeholder="What did you work on?"
                value={manual.description ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, description: e.target.value }))}
              />

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSave(manual)}
                className="mb-3 w-full rounded-lg bg-[#06E1DC] px-6 py-4 text-base font-bold tracking-wide text-[#071E37] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-[#1a3050] disabled:text-[rgba(255,255,255,0.3)]"
              >
                {submitting ? "⏳ Logging…" : "✓ Log This Entry"}
              </button>
            </div>
          )}

          {result && (
            <div
              className={`mb-3 rounded-lg border px-4 py-4 text-[15px] leading-relaxed ${
                result.ok
                  ? "border-[#06E1DC] bg-[rgba(6,225,220,0.1)] text-[#06E1DC]"
                  : "border-[#ff4444] bg-[rgba(255,68,68,0.1)] text-[#ff8a8a]"
              }`}
            >
              <p className="mb-1 font-bold">{result.ok ? "✓ " : "✗ "}{result.message}</p>
              {result.detail && <p className="text-sm text-white">{result.detail}</p>}
            </div>
          )}

          <Link
            href="/time-entries"
            className="block w-full rounded-lg border border-[rgba(6,225,220,0.3)] bg-transparent px-4 py-3 text-center text-sm text-white transition-colors hover:border-[#06E1DC] hover:text-[#06E1DC]"
          >
            ← Back to Time Entries
          </Link>
        </div>
      </div>

      <footer className="border-t-2 border-[#06E1DC] bg-[#071E37] px-4 py-4 text-center text-[13px]">
        <span className="text-[#06E1DC]">SecureTECC Solutions</span> · Internal Use Only · 877.707.TECC
      </footer>

      <style>{`
        .vl-field {
          width: 100%;
          box-sizing: border-box;
          padding: 14px 16px;
          background: rgba(6, 225, 220, 0.05);
          border: 1px solid rgba(6, 225, 220, 0.2);
          border-radius: 10px;
          color: #FFFFFF;
          font-size: 15px;
          font-family: inherit;
          margin-bottom: 14px;
          outline: none;
          line-height: 1.6;
        }
        .vl-field:focus { border-color: #06E1DC !important; }
        .vl-field:hover { border-color: rgba(6, 225, 220, 0.5); }
        .vl-field option { background: #071E37; color: #FFFFFF; }
        select.vl-field { color-scheme: dark; }
        input[type="date"].vl-field { color-scheme: dark; }
      `}</style>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#06E1DC]">{children}</div>
  );
}

function VoiceReviewFields({
  draft,
  setDraft,
  clients,
  serviceTypes,
}: {
  draft: Partial<TimeEntryFormValues>;
  setDraft: (d: Partial<TimeEntryFormValues>) => void;
  clients: ClientOption[];
  serviceTypes: ServiceTypeOption[];
}) {
  return (
    <div>
      <FieldLabel>Client</FieldLabel>
      <select
        className="vl-field"
        value={draft.clientId ?? ""}
        onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
      >
        <option value="">Select a client...</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <FieldLabel>Date</FieldLabel>
      <input
        type="date"
        className="vl-field"
        value={draft.date ?? ""}
        onChange={(e) => setDraft({ ...draft, date: e.target.value })}
      />

      <FieldLabel>Hours</FieldLabel>
      <input
        type="number"
        step="0.25"
        min="0"
        className="vl-field"
        value={draft.durationHours ?? ""}
        onChange={(e) => setDraft({ ...draft, durationHours: Number(e.target.value) })}
      />

      <FieldLabel>Service Type</FieldLabel>
      <select
        className="vl-field"
        value={draft.serviceTypeId ?? ""}
        onChange={(e) => setDraft({ ...draft, serviceTypeId: e.target.value })}
      >
        <option value="">Select a service type...</option>
        {serviceTypes.map((st) => (
          <option key={st.id} value={st.id}>
            {st.code} — {st.label}
          </option>
        ))}
      </select>

      <FieldLabel>Billable Status</FieldLabel>
      <select
        className="vl-field"
        value={draft.billableStatus ?? "Billable"}
        onChange={(e) =>
          setDraft({ ...draft, billableStatus: e.target.value as TimeEntryFormValues["billableStatus"] })
        }
      >
        {Object.entries(BILLABLE_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <FieldLabel>Description</FieldLabel>
      <textarea
        className="vl-field min-h-[90px] resize-y"
        value={draft.description ?? ""}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
    </div>
  );
}

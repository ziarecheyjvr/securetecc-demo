"use client";

import { useState } from "react";
import { lookupTicketStatus, type TicketStatusResult } from "@/app/support/actions";

/** Same field/label tokens as SupportForm, for a consistent public-portal look. */
const FIELD =
  "w-full rounded-[10px] border border-[rgba(6,225,220,0.24)] bg-[rgba(6,225,220,0.05)] px-4 py-[13px] text-[15px] text-white outline-none transition-colors placeholder:text-[rgba(255,255,255,0.35)] focus:border-[#06E1DC]";
const LABEL = "mb-2 block text-xs font-bold uppercase tracking-[1.5px] text-[#06E1DC]";

const STATUS_LABELS: Record<string, string> = {
  New: "Received — not yet started",
  InProgress: "In progress",
  WaitingOnClient: "Waiting on client",
  Completed: "Completed",
  Closed: "Closed",
};

export function TicketStatusForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TicketStatusResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const form = new FormData(e.currentTarget);
    const outcome = await lookupTicketStatus(
      String(form.get("ticketNumber") ?? ""),
      String(form.get("contactEmail") ?? ""),
    );
    setSubmitting(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setResult(outcome);
  }

  return (
    <div className="space-y-5 text-left">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="ticketNumber" className={LABEL}>
            Ticket number
          </label>
          <input
            id="ticketNumber"
            name="ticketNumber"
            placeholder="TKT-0001"
            required
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="contactEmail" className={LABEL}>
            Email you used to submit it
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
            className={FIELD}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-[#ff8a8a]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-[10px] bg-[#06E1DC] px-10 py-[15px] text-base font-bold tracking-[0.2px] text-[#071E37] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Checking…" : "Check status"}
        </button>
      </form>

      {result && result.ok && result.found && (
        <div className="rounded-[14px] border border-[rgba(6,225,220,0.24)] bg-[#071E37] p-6 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[2px] text-[#06E1DC]">
            {result.ticketNumber}
          </p>
          <h2 className="mb-2 text-xl font-bold">
            {STATUS_LABELS[result.status] ?? result.status}
          </h2>
          <p className="text-[14px] text-[rgba(255,255,255,0.74)]">
            {result.issueType} · submitted{" "}
            {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
              new Date(result.submittedAt),
            )}
          </p>
        </div>
      )}

      {result && result.ok && !result.found && (
        <p className="text-center text-sm text-[rgba(255,255,255,0.74)]">
          We couldn&apos;t find a matching request. Double-check the ticket number and the email
          address you submitted it with.
        </p>
      )}
    </div>
  );
}

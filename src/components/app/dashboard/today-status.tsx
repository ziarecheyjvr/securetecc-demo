import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { DashboardMetrics } from "@/lib/dashboard/metrics";

/**
 * "Have you logged today?"
 *
 * This IS the reminder now. There used to be a 7pm Pacific email as well, and
 * it has been removed: the people it nagged are in the platform every day,
 * and a mail that repeats what the first screen already says is one more
 * thing to delete. Asking here means the answer is one click away instead of
 * in another app.
 *
 * "Logged today" keeps its old definition -- any time entry created by this
 * user since PACIFIC midnight, not the server's, which on Vercel is UTC and
 * rolls over at 5pm local.
 *
 * Status is carried by an icon and a sentence, never by colour alone.
 */
/** "Tue 26 Aug" from a yyyy-mm-dd, split rather than parsed -- a date-only
 *  string through `new Date()` is UTC midnight, a day early in Pacific. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function TodayStatus({
  today,
  firstName,
}: {
  today: DashboardMetrics["today"];
  firstName: string;
}) {
  const done = today.hasLogged;
  // A gap is worth flagging even on a day that IS logged: the Tuesday nobody
  // noticed last week is exactly what the old email never caught.
  const missing = today.missingDays;
  const complete = done && missing.length === 0;

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
      style={{
        borderColor: complete ? "var(--viz-good)" : "var(--viz-warn)",
        background: complete
          ? "color-mix(in oklab, var(--viz-good) 8%, transparent)"
          : "color-mix(in oklab, var(--viz-warn) 8%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: complete ? "var(--viz-good)" : "var(--viz-warn)" }}
      >
        {complete ? "✓" : "!"}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {done
            ? `Time logged today — ${today.loggedHours}h across ${today.loggedEntries} ${today.loggedEntries === 1 ? "entry" : "entries"}.`
            : `No time logged today yet, ${firstName}.`}
        </p>
        <p className="text-xs text-muted-foreground">
          {missing.length > 0 ? (
            <>
              {missing.length} weekday{missing.length === 1 ? "" : "s"} in the last fortnight with
              nothing logged: {missing.slice(0, 5).map(dayLabel).join(", ")}
              {missing.length > 5 ? ` and ${missing.length - 5} more` : ""}.
            </>
          ) : done ? (
            "Nothing missing in the last fortnight either."
          ) : (
            "This is your reminder — there is no longer an email one."
          )}
        </p>
      </div>

      <Link
        href="/time-entries"
        className={buttonVariants({ size: "sm", variant: done ? "outline" : "default" })}
      >
        {done ? "Add another" : "Log time"}
      </Link>
    </div>
  );
}

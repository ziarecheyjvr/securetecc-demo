/**
 * Safe mode: the app touches nothing outside its own database.
 *
 * Set SAFE_MODE=1 and no email can be sent, no Gmail draft created, and no
 * file written to Drive -- regardless of which code path runs, which button
 * is clicked, or which cron fires. Intended for data migration and for
 * testing against real data, where the records are the point and the side
 * effects are not.
 *
 * This is a belt-and-braces guarantee, not the only one: the migration script
 * imports no email, Drive or Gmail code at all, so it cannot produce these
 * effects even with safe mode off. Safe mode covers the app AROUND the
 * migration -- a cron firing mid-import, or someone clicking a button on a
 * freshly imported invoice.
 *
 * Read at call time rather than captured at module load so a serverless
 * instance can't hold a stale value from before an env change.
 */
export function safeMode(): boolean {
  const v = process.env.SAFE_MODE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Uniform note for the UI/logs when safe mode blocked something. */
export const SAFE_MODE_NOTICE =
  "SAFE_MODE is on — external effects (email, Gmail drafts, Drive uploads) are disabled.";

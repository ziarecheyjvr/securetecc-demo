import { prisma } from "@/lib/db/prisma";
import { headers } from "next/headers";

/**
 * DB-backed fixed-window rate limiter for public, unauthenticated Server
 * Actions (ticket submission, ticket status lookup). An in-memory counter
 * would reset on every cold start and wouldn't be shared across concurrent
 * serverless instances -- this table is the durable, shared counter.
 *
 * Uses the trusted `prisma` client directly, not `withRLS()` -- same
 * category as the ticket-sequence increment in submitPublicTicket. This
 * table holds no tenant data and is never meant to be queried per-org.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const hit = await prisma.rateLimitHit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart },
    update: { count: { increment: 1 } },
  });

  // Opportunistic cleanup, fire-and-forget -- no cron job needed for a table
  // that's only ever a rolling window of recent counters. Sampled rather than
  // run every call so it doesn't add a query to every request.
  if (Math.random() < 0.01) {
    void prisma.rateLimitHit
      .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 3_600_000) } } })
      .catch(() => {});
  }

  if (hit.count > limit) {
    const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000);
    return { ok: false, retryAfterSeconds };
  }
  return { ok: true };
}

/**
 * Best-effort client IP from the incoming request's forwarding headers.
 * Server Actions don't get a request object directly, but `headers()` reads
 * from the same AsyncLocalStorage Route Handlers do. Vercel sets
 * `x-forwarded-for`; falls back to `x-real-ip`, then a constant bucket so a
 * missing header degrades to "rate-limit everyone together" rather than
 * "rate-limit no one."
 */
export async function getClientIp(): Promise<string> {
  const hdrs = await headers();
  const forwardedFor = hdrs.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return hdrs.get("x-real-ip") ?? "unknown";
}

function minutes(seconds: number): string {
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

export function rateLimitedMessage(retryAfterSeconds: number): string {
  return `Too many requests. Please try again in ${minutes(retryAfterSeconds)}.`;
}

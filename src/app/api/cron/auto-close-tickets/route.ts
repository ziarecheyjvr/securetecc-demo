import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, unauthorizedResponse } from "@/lib/cron/auth";
import type { Schedule } from "@/lib/cron/pacific";
import { claimCronRun, skippedResponse } from "@/lib/cron/claim";
import { autoCloseCompletedTickets } from "@/lib/tickets/auto-close";

/**
 * Intended schedule: midnight Pacific, daily.
 *
 * vercel.json fires this at BOTH candidate UTC hours (the PST and PDT
 * offsets); the gate below runs it on whichever one is actually the right
 * Pacific local time and no-ops on the other, so it never drifts at DST.
 */
const SCHEDULE: Schedule = { hour: 0 };

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return unauthorizedResponse();
  // Claims this occurrence, so the second candidate UTC hour retries a missed
  // run instead of being rejected for being an hour late.
  const claim = await claimCronRun("auto-close-tickets", SCHEDULE);
  if (!claim.run) return NextResponse.json(skippedResponse("auto-close-tickets", claim));

  const result = await autoCloseCompletedTickets();
  return NextResponse.json({ ok: true, ...result });
}

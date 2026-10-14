import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, unauthorizedResponse } from "@/lib/cron/auth";
import type { Schedule } from "@/lib/cron/pacific";
import { claimCronRun, skippedResponse } from "@/lib/cron/claim";
import { sendWeeklyTicketDigests } from "@/lib/email/digests";

/**
 * Intended schedule: 8am Pacific, Mondays.
 *
 * vercel.json fires this at BOTH candidate UTC hours (the PST and PDT
 * offsets); the gate below runs it on whichever one is actually the right
 * Pacific local time and no-ops on the other, so it never drifts at DST.
 */
const SCHEDULE: Schedule = { hour: 8, weekdays: [1] };

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return unauthorizedResponse();
  // Claims this occurrence, so the second candidate UTC hour retries a missed
  // run instead of being rejected for being an hour late.
  const claim = await claimCronRun("weekly-digest", SCHEDULE);
  if (!claim.run) return NextResponse.json(skippedResponse("weekly-digest", claim));

  const results = await sendWeeklyTicketDigests();
  return NextResponse.json({ ok: true, results });
}

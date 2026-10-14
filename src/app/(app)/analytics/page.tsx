import { requireAdminContext } from "@/lib/auth";
import { PACIFIC_TZ } from "@/lib/cron/pacific";
import { resolveRange } from "@/lib/dashboard/metrics";
import { loadSiteAnalytics } from "@/lib/google/analytics";
import { AnalyticsView } from "@/components/app/analytics/analytics-view";

type SearchParams = Promise<{ range?: string; from?: string; to?: string }>;

/**
 * securetecc.com traffic, read live from Google Analytics.
 *
 * Admin-only, like Reports: it sits beside the revenue numbers and is read
 * for the same decisions.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminContext();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to);
  const result = await loadSiteAnalytics({ start: range.start, endExclusive: range.end, timeZone: PACIFIC_TZ });

  return <AnalyticsView range={range} result={result} from={sp.from} to={sp.to} />;
}

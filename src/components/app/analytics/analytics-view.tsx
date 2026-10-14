import { Suspense } from "react";
import { ChartLine } from "lucide-react";
import type { ResolvedRange } from "@/lib/dashboard/metrics";
import type { AnalyticsResult, AnalyticsTotals, Breakdown } from "@/lib/google/analytics";
import { RangeFilter } from "@/components/app/dashboard/range-filter";
import { TrafficChart } from "@/components/app/analytics/traffic-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return shortDate.format(new Date(Date.UTC(y, m - 1, d, 12)));
};

/**
 * The Analytics page body, given an already-loaded result.
 *
 * Every number is compared with the equally long period just before, because
 * "80 sessions" means nothing on its own.
 */
export function AnalyticsView({
  range,
  result,
  from,
  to,
}: {
  range: ResolvedRange;
  result: AnalyticsResult;
  from?: string;
  to?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Website traffic for securetecc.com, from Google Analytics.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{range.label}</h2>
          {result.ok && (
            <p className="text-xs text-muted-foreground">
              {fmtYmd(result.data.period.start)} – {fmtYmd(result.data.period.end)}, compared with{" "}
              {fmtYmd(result.data.period.previousStart)} – {fmtYmd(result.data.period.previousEnd)}
            </p>
          )}
        </div>
        <Suspense fallback={null}>
          <RangeFilter current={range.key} from={from} to={to} />
        </Suspense>
      </div>

      {!result.ok ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ChartLine className="h-4 w-4 text-muted-foreground" />
              {result.reason === "not-configured"
                ? "Not connected"
                : result.reason === "api-disabled"
                  ? "One step left in Google Cloud"
                  : result.reason === "not-authorized"
                    ? "Not authorized yet"
                    : "Google Analytics is unavailable"}
            </CardTitle>
            <CardDescription>{result.message}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Visitors" metric="users" data={result.data} />
            <Stat label="Sessions" metric="sessions" data={result.data} />
            <Stat label="Page views" metric="pageViews" data={result.data} />
            <Stat label="Engagement rate" metric="engagementRate" data={result.data} percent />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">
                  Visitors {result.data.granularity === "day" ? "per day" : "per month"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TrafficChart data={result.data.trend} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads from the website</CardTitle>
                <CardDescription>Contact form activity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <LeadRow label="Forms submitted" now={result.data.current.leads} before={result.data.previous.leads} />
                <LeadRow
                  label="Forms started"
                  now={result.data.current.formStarts}
                  before={result.data.previous.formStarts}
                />
                <p className="text-xs text-muted-foreground">
                  {result.data.current.sessions > 0
                    ? `${((result.data.current.leads / result.data.current.sessions) * 100).toFixed(1)}% of sessions ended in a submitted form.`
                    : "No sessions in this period."}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard title="Where visitors came from" description="Sessions by channel" rows={result.data.channels} />
            <BreakdownCard
              title="Pages people landed on"
              description="The first page of each session"
              rows={result.data.landingPages}
            />
          </div>
        </>
      )}
    </div>
  );
}

function change(now: number, before: number): { text: string; tone: "up" | "down" | "flat" } {
  if (before === 0) return now === 0 ? { text: "no change", tone: "flat" } : { text: "new this period", tone: "up" };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: "no change", tone: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct}% vs before`, tone: pct > 0 ? "up" : "down" };
}

const TONE = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
};

function Stat({
  label,
  metric,
  data,
  percent,
}: {
  label: string;
  metric: keyof AnalyticsTotals;
  data: { current: AnalyticsTotals; previous: AnalyticsTotals };
  percent?: boolean;
}) {
  const now = data.current[metric];
  const before = data.previous[metric];
  const format = (v: number) => (percent ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("en-US"));
  const delta = change(now, before);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{format(now)}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        <span className={TONE[delta.tone]}>{delta.text}</span> · was {format(before)}
      </CardContent>
    </Card>
  );
}

function LeadRow({ label, now, before }: { label: string; now: number; before: number }) {
  const delta = change(now, before);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm">{label}</span>
      <span className="text-right">
        <span className="text-xl font-semibold tabular-nums">{now}</span>
        <span className={`ml-2 text-xs ${TONE[delta.tone]}`}>{delta.text}</span>
      </span>
    </div>
  );
}

function BreakdownCard({ title, description, rows }: { title: string; description: string; rows: Breakdown[] }) {
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions in this period.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.name} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{r.sessions}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-[var(--viz-1)]"
                    style={{ width: `${(r.sessions / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

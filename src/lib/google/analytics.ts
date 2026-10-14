import { getServiceAccountToken, GoogleNotConfiguredError } from "./auth";

/**
 * Website traffic for securetecc.com, read from the GA4 Data API.
 *
 * Authenticates as the service account itself -- it was added to the GA4
 * property as a Viewer -- rather than through domain-wide delegation, which
 * Analytics does not use.
 *
 * Leads are counted from the `generate_lead` EVENT, not from GA's key-event
 * metric: an event only counts as a key event from the day it is marked as
 * one, so the metric would silently read zero for every period before that.
 * The event itself has been recorded all along.
 */
export const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const LEAD_EVENT = "generate_lead";
const FORM_START_EVENT = "form_start";

export type AnalyticsTotals = {
  users: number;
  sessions: number;
  pageViews: number;
  engagementRate: number;
  leads: number;
  formStarts: number;
};

export type TrendPoint = { key: string; label: string; users: number; sessions: number };
export type Breakdown = { name: string; sessions: number };

export type SiteAnalytics = {
  current: AnalyticsTotals;
  previous: AnalyticsTotals;
  /** Daily for ranges up to ~3 months, monthly beyond that. */
  trend: TrendPoint[];
  granularity: "day" | "month";
  channels: Breakdown[];
  landingPages: Breakdown[];
  /** The periods compared, as the yyyy-mm-dd dates GA was asked for. */
  period: { start: string; end: string; previousStart: string; previousEnd: string };
};

export type AnalyticsResult =
  | { ok: true; data: SiteAnalytics }
  | {
      ok: false;
      reason: "not-configured" | "api-disabled" | "not-authorized" | "error";
      message: string;
    };

const DAY_MS = 86_400_000;

/** yyyy-mm-dd <-> a UTC-noon Date, so day arithmetic never trips over DST. */
function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function dateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The GA date window for a range, plus the equally long window just before it.
 *
 * GA reports in the property's own time zone, so the range's Pacific instants
 * become Pacific calendar dates. The end is clamped to today: "this month"
 * runs to the end of the month, and comparing a half-finished month against
 * a whole one would make every month look like a collapse.
 */
export function analyticsPeriod(
  start: Date,
  endExclusive: Date,
  timeZone: string,
  now = new Date(),
): SiteAnalytics["period"] {
  const ymdIn = new Intl.DateTimeFormat("en-CA", { timeZone });
  const startYmd = ymdIn.format(start);
  const lastYmd = ymdIn.format(new Date(endExclusive.getTime() - 60_000));
  const todayYmd = ymdIn.format(now);
  const endYmd = lastYmd < todayYmd ? lastYmd : todayYmd;
  const safeEnd = endYmd < startYmd ? startYmd : endYmd;

  const days = Math.round((ymdToDate(safeEnd).getTime() - ymdToDate(startYmd).getTime()) / DAY_MS) + 1;
  const previousEnd = new Date(ymdToDate(startYmd).getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * DAY_MS);

  return {
    start: startYmd,
    end: safeEnd,
    previousStart: dateToYmd(previousStart),
    previousEnd: dateToYmd(previousEnd),
  };
}

type ReportRow = {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
};
type Report = { rows?: ReportRow[] };

const num = (v?: string) => (v ? Number(v) || 0 : 0);

async function refusal(response: Response): Promise<AnalyticsResult & { ok: false }> {
  let body: { error?: { message?: string; status?: string; errors?: { reason?: string }[] } } = {};
  try {
    body = await response.json();
  } catch {
    // An unreadable body falls through to the generic message.
  }
  const message = body.error?.message ?? "";
  const reasons = (body.error?.errors ?? []).map((e) => e.reason);

  if (reasons.includes("accessNotConfigured") || /has not been used in project|is disabled/i.test(message)) {
    return {
      ok: false,
      reason: "api-disabled",
      message:
        "The Google Analytics Data API is not enabled on the Cloud project (securetecc-platform). " +
        "It has to be switched on by an account with permission on that project.",
    };
  }
  if (response.status === 403) {
    return {
      ok: false,
      reason: "not-authorized",
      message:
        "Google Analytics refused access. Add the platform's service account to the GA4 property " +
        "as a Viewer (Admin → Property access management), and check GA4_PROPERTY_ID is right.",
    };
  }
  return {
    ok: false,
    reason: "error",
    message: `Google Analytics returned ${response.status}${message ? `: ${message}` : ""}.`,
  };
}

/**
 * Everything the Analytics page shows, in ONE batchRunReports call.
 *
 * Five reports ride in one request so the page costs one round trip and one
 * slice of quota rather than five.
 */
export async function loadSiteAnalytics(args: {
  start: Date;
  endExclusive: Date;
  timeZone: string;
}): Promise<AnalyticsResult> {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  if (!propertyId) {
    return {
      ok: false,
      reason: "not-configured",
      message: "GA4_PROPERTY_ID is not set. For securetecc.com it is 476581426.",
    };
  }

  let token: string;
  try {
    token = await getServiceAccountToken(ANALYTICS_SCOPE);
  } catch (err) {
    if (err instanceof GoogleNotConfiguredError) {
      return {
        ok: false,
        reason: "not-configured",
        message: "The Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY).",
      };
    }
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : String(err) };
  }

  const period = analyticsPeriod(args.start, args.endExclusive, args.timeZone);
  const days = Math.round((ymdToDate(period.end).getTime() - ymdToDate(period.start).getTime()) / DAY_MS) + 1;
  const granularity: SiteAnalytics["granularity"] = days <= 93 ? "day" : "month";

  const current = { startDate: period.start, endDate: period.end };
  const previous = { startDate: period.previousStart, endDate: period.previousEnd };
  const trafficMetrics = [
    { name: "activeUsers" },
    { name: "sessions" },
    { name: "screenPageViews" },
    { name: "engagementRate" },
  ];

  const requests = [
    // 0: headline totals, both periods.
    { dateRanges: [current, previous], metrics: trafficMetrics },
    // 1: form events, both periods.
    {
      dateRanges: [current, previous],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", inListFilter: { values: [LEAD_EVENT, FORM_START_EVENT] } },
      },
    },
    // 2: trend.
    {
      dateRanges: [current],
      dimensions: [{ name: granularity === "day" ? "date" : "yearMonth" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: granularity === "day" ? "date" : "yearMonth" } }],
      limit: 400,
    },
    // 3: where visits came from.
    {
      dateRanges: [current],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    },
    // 4: pages people arrived on.
    {
      dateRanges: [current],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    },
  ];

  let response: Response;
  try {
    response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:batchRunReports`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    );
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: `Could not reach Google Analytics: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!response.ok) return refusal(response);

  const { reports = [] } = (await response.json()) as { reports?: Report[] };
  const [totalsReport, eventsReport, trendReport, channelReport, landingReport] = reports;

  // With two date ranges, GA appends a "dateRange" dimension to every row,
  // valued "date_range_0" (current) or "date_range_1" (previous).
  const blankTotals = (): AnalyticsTotals => ({
    users: 0,
    sessions: 0,
    pageViews: 0,
    engagementRate: 0,
    leads: 0,
    formStarts: 0,
  });
  const totals = [blankTotals(), blankTotals()];
  const rangeIndex = (row: ReportRow) =>
    row.dimensionValues?.at(-1)?.value === "date_range_1" ? 1 : 0;

  for (const row of totalsReport?.rows ?? []) {
    const t = totals[rangeIndex(row)];
    const m = row.metricValues ?? [];
    t.users = num(m[0]?.value);
    t.sessions = num(m[1]?.value);
    t.pageViews = num(m[2]?.value);
    t.engagementRate = num(m[3]?.value);
  }
  for (const row of eventsReport?.rows ?? []) {
    const t = totals[rangeIndex(row)];
    const count = num(row.metricValues?.[0]?.value);
    const event = row.dimensionValues?.[0]?.value;
    if (event === LEAD_EVENT) t.leads = count;
    if (event === FORM_START_EVENT) t.formStarts = count;
  }

  const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  const byKey = new Map(
    (trendReport?.rows ?? []).map((row) => [
      row.dimensionValues?.[0]?.value ?? "",
      { users: num(row.metricValues?.[0]?.value), sessions: num(row.metricValues?.[1]?.value) },
    ]),
  );

  // GA omits days with no traffic; fill them so a quiet week shows as a dip
  // to zero rather than a line drawn straight across it.
  const trend: TrendPoint[] = [];
  if (granularity === "day") {
    for (let d = ymdToDate(period.start); dateToYmd(d) <= period.end; d = new Date(d.getTime() + DAY_MS)) {
      const key = dateToYmd(d).replaceAll("-", "");
      trend.push({ key, label: dayLabel.format(d), ...(byKey.get(key) ?? { users: 0, sessions: 0 }) });
    }
  } else {
    const [sy, sm] = period.start.split("-").map(Number);
    const [ey, em] = period.end.split("-").map(Number);
    for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
      const key = `${y}${String(m).padStart(2, "0")}`;
      trend.push({
        key,
        label: monthLabel.format(new Date(Date.UTC(y, m - 1, 15))),
        ...(byKey.get(key) ?? { users: 0, sessions: 0 }),
      });
    }
  }

  const breakdown = (report?: Report): Breakdown[] =>
    (report?.rows ?? []).map((row) => ({
      name: row.dimensionValues?.[0]?.value || "(not set)",
      sessions: num(row.metricValues?.[0]?.value),
    }));

  return {
    ok: true,
    data: {
      current: totals[0],
      previous: totals[1],
      trend,
      granularity,
      channels: breakdown(channelReport),
      landingPages: breakdown(landingReport),
      period,
    },
  };
}

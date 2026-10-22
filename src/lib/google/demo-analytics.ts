import { analyticsPeriod, type Breakdown, type SiteAnalytics, type TrendPoint } from "./analytics";

/**
 * Website traffic for the demo, in the shape the Analytics tab expects.
 *
 * The demo has no Google Analytics property behind it, and an empty "not
 * connected" panel shows nothing about what the tab does. These numbers are
 * invented, but not randomly: every figure is derived from the date it falls
 * on, so a given day reads the same on every load and the comparison against
 * the previous period stays stable while someone is being shown around.
 *
 * Weekdays carry more traffic than weekends, which is what a business site
 * actually looks like and what makes the daily chart worth drawing.
 */

const DAY_MS = 86_400_000;

/** Deterministic 0-1 from a string: the same day always gives the same number. */
function noise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function daysBetween(startYmd: string, endYmd: string): Date[] {
  const out: Date[] = [];
  for (let d = ymdToDate(startYmd); d.toISOString().slice(0, 10) <= endYmd; d = new Date(d.getTime() + DAY_MS)) {
    out.push(d);
  }
  return out;
}

/** One day's visitors: a weekday baseline, nudged by the date's own noise. */
function visitorsOn(day: Date): number {
  const weekday = day.getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  const base = weekend ? 5 : 16;
  const spread = weekend ? 4 : 11;
  return Math.max(1, Math.round(base + noise(`v${day.toISOString().slice(0, 10)}`) * spread));
}

type Window = { users: number; sessions: number; pageViews: number; engagementRate: number; leads: number; formStarts: number };

function totalsFor(days: Date[]): Window {
  let users = 0;
  for (const day of days) users += visitorsOn(day);
  const sessions = Math.round(users * 1.27);
  // A lead every ~55 sessions, and roughly two and a half starts per lead:
  // most people who open a contact form never finish it.
  const leads = Math.max(0, Math.round(sessions / 55));
  return {
    users,
    sessions,
    pageViews: Math.round(sessions * 1.74),
    engagementRate: 0.41 + noise(`e${days[0]?.toISOString().slice(0, 7) ?? "x"}`) * 0.14,
    leads,
    formStarts: Math.max(leads, Math.round(leads * 2.4)),
  };
}

function trendFor(days: Date[], granularity: "day" | "month"): TrendPoint[] {
  const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

  if (granularity === "day") {
    return days.map((day) => {
      const users = visitorsOn(day);
      return {
        key: day.toISOString().slice(0, 10).replaceAll("-", ""),
        label: dayLabel.format(day),
        users,
        sessions: Math.round(users * 1.27),
      };
    });
  }

  const byMonth = new Map<string, { users: number; day: Date }>();
  for (const day of days) {
    const key = `${day.getUTCFullYear()}${String(day.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key) ?? { users: 0, day };
    row.users += visitorsOn(day);
    byMonth.set(key, row);
  }
  return [...byMonth.entries()].map(([key, row]) => ({
    key,
    label: monthLabel.format(row.day),
    users: row.users,
    sessions: Math.round(row.users * 1.27),
  }));
}

/** Sessions split across a fixed set of shares, summing to the total. */
function split(total: number, shares: [string, number][]): Breakdown[] {
  const rows = shares.map(([name, share]) => ({ name, sessions: Math.round(total * share) }));
  const drift = total - rows.reduce((s, r) => s + r.sessions, 0);
  if (rows.length > 0) rows[0].sessions = Math.max(0, rows[0].sessions + drift);
  return rows.filter((r) => r.sessions > 0).sort((a, b) => b.sessions - a.sessions);
}

export function buildDemoAnalytics(args: { start: Date; endExclusive: Date; timeZone: string }): SiteAnalytics {
  const period = analyticsPeriod(args.start, args.endExclusive, args.timeZone);
  const days = daysBetween(period.start, period.end);
  const previousDays = daysBetween(period.previousStart, period.previousEnd);
  const granularity: SiteAnalytics["granularity"] = days.length <= 93 ? "day" : "month";

  const current = totalsFor(days);
  const previous = totalsFor(previousDays);

  return {
    current,
    previous,
    trend: trendFor(days, granularity),
    granularity,
    channels: split(current.sessions, [
      ["Organic Search", 0.38],
      ["Direct", 0.34],
      ["Referral", 0.16],
      ["Organic Social", 0.09],
      ["Email", 0.03],
    ]),
    landingPages: split(current.sessions, [
      ["/", 0.44],
      ["/managed-it-services/", 0.17],
      ["/contact-us/", 0.13],
      ["/blogs/", 0.11],
      ["/testimonials/", 0.08],
      ["/location/", 0.07],
    ]),
    period,
  };
}

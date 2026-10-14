import {
  pacificDayStart,
  pacificMidnight,
  pacificMonthStart,
  pacificMonthStartsBack,
  PACIFIC_TZ,
} from "@/lib/cron/pacific";
import type { TxClient } from "@/lib/db/rls";
import { resolveRate, toRate } from "@/lib/billing/rates";

/**
 * Dashboard aggregates.
 *
 * Every date boundary here is PACIFIC, not UTC -- the same correctness point
 * the daily digest had to be fixed for. "Revenue this month" must not shift by
 * a day depending on what time of day the page is loaded.
 *
 * All queries take the caller's open `tx` so the whole dashboard is one
 * withRLS transaction rather than a dozen, matching how requireOrgContext's
 * callback is used elsewhere.
 */

/**
 * The floor under the monthly target. Tony set $10,000 as the minimum the
 * business should be producing in billable time; a lower saved goal would
 * make a thin month look on track.
 */
export const MIN_MONTHLY_TARGET = 10_000;

export type RangeKey = "mtd" | "3m" | "6m" | "12m" | "custom";

export const RANGE_LABELS: Record<Exclude<RangeKey, "custom">, string> = {
  mtd: "This month",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
};

const MONTHS_FOR: Record<Exclude<RangeKey, "custom">, number> = {
  mtd: 1,
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

export type ResolvedRange = {
  key: RangeKey;
  label: string;
  start: Date;
  /** Exclusive upper bound. */
  end: Date;
  /** Month-start instants covering the range, oldest first. */
  buckets: Date[];
};

/**
 * Turns the URL's range params into concrete Pacific instants.
 *
 * Falls back to "this month" for anything unparseable rather than throwing --
 * a hand-edited query string should not 500 the dashboard.
 */
export function resolveRange(key?: string, from?: string, to?: string): ResolvedRange {
  if (key === "custom" && from && to) {
    // Parsed as PACIFIC midnight, not `new Date("2026-01-15T00:00:00")` --
    // that parses in the server's zone, which is UTC on Vercel, so a picked
    // date would silently start at 4pm the previous day in Pacific terms and
    // disagree with every other range on this page.
    const start = ymdToPacific(from);
    const end = ymdToPacific(to);
    if (start && end && start <= end) {
      // The picked end date is inclusive, so the exclusive bound is the
      // following Pacific midnight.
      const endExclusive = nextDayStart(end);
      return {
        key: "custom",
        label: `${formatDay(start)} – ${formatDay(end)}`,
        start,
        end: endExclusive,
        buckets: monthBucketsBetween(start, endExclusive),
      };
    }
  }

  const safe = (key && key in MONTHS_FOR ? key : "mtd") as Exclude<RangeKey, "custom">;
  const buckets = pacificMonthStartsBack(MONTHS_FOR[safe]);
  return {
    key: safe,
    label: RANGE_LABELS[safe],
    start: buckets[0],
    end: nextMonthStart(pacificMonthStart()),
    buckets,
  };
}

/** Pacific midnight starting the day after `d`'s Pacific day. */
function nextDayStart(d: Date): Date {
  // +36h lands solidly inside the next Pacific day regardless of a DST shift,
  // then pacificDayStart snaps back to that day's true midnight.
  return pacificDayStart(new Date(d.getTime() + 36 * 3_600_000));
}

/** "2026-01-15" -> Pacific midnight that day, or null if unparseable. */
function ymdToPacific(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const at = pacificMidnight(y, mo, d);
  return Number.isNaN(at.getTime()) ? null : at;
}

function nextMonthStart(monthStart: Date): Date {
  const d = new Date(monthStart);
  d.setUTCDate(20); // safely mid-month before advancing, avoids 31st overflow
  d.setUTCMonth(d.getUTCMonth() + 1);
  return pacificMonthStart(d);
}

function monthBucketsBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let cur = pacificMonthStart(start);
  while (cur < end) {
    out.push(cur);
    cur = nextMonthStart(cur);
  }
  return out.length ? out : [pacificMonthStart(start)];
}

function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatMonth(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC_TZ, month: "short" }).format(d);
}

export function formatMonthYear(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC_TZ, month: "short", year: "numeric" }).format(d);
}

export type RevenueBucket = {
  monthStart: string;
  label: string;
  paid: number;
  sent: number;
  draft: number;
  total: number;
};

export type ClientShare = { name: string; amount: number };

export type DashboardMetrics = {
  today: {
    loggedEntries: number;
    loggedHours: number;
    hasLogged: boolean;
    /**
     * Recent WEEKDAYS with nothing logged by this person, most recent first.
     * Today is excluded -- the day is not over, and calling it missing before
     * 6pm would cry wolf every morning. This is the in-platform replacement
     * for the 7pm email, and it has to look further back than one day: the
     * gap that costs money is the Tuesday nobody noticed last week.
     */
    missingDays: string[];
  };
  goal: {
    /** The monthly target, never below MIN_MONTHLY_TARGET. */
    target: number;
    /**
     * Billable time logged this month, at each entry's rate -- invoiced or
     * not. The number the target is measured against.
     */
    billable: number;
    billableHours: number;
    /** Invoices raised this month. Shown beside the goal, never as progress on it. */
    invoiced: number;
    /** Billable, not-yet-invoiced value sitting in time entries. */
    pipeline: number;
    /** 0-1, uncapped ratio is exposed separately for the label. */
    ratio: number;
    monthLabel: string;
    daysElapsed: number;
    daysInMonth: number;
  };
  revenue: RevenueBucket[];
  clientShare: { top: ClientShare[]; otherAmount: number; otherCount: number; total: number };
  hours: { billable: number; nonBillable: number; unbilledValue: number; unbilledHours: number };
  /** This calendar month only -- what still needs invoicing for the period in progress. */
  thisMonth: { billableHours: number; billableValue: number; unbilledHours: number; unbilledValue: number };
  /**
   * Clients carrying unbilled work older than their billing cadence allows.
   * Tony's rule: nothing goes longer than a quarter unbilled.
   */
  needsBilling: {
    clientId: string;
    name: string;
    cadence: string;
    oldestEntryDays: number;
    unbilledHours: number;
    unbilledValue: number;
    overdue: boolean;
  }[];
  tickets: {
    open: number;
    inProgress: number;
    newCount: number;
    /** Blocked on the client -- open, but not waiting on us. */
    waitingOnClient: number;
    resolvedInRange: number;
    /** Most recent unresolved tickets, for the dashboard's attention list. */
    recent: { id: string; ticketNumber: string; company: string; urgency: string; ageDays: number }[];
  };
  counts: { activeClients: number; draftInvoices: number };
  /** Sent-but-unpaid invoices, worst-overdue first. */
  awaitingPayment: {
    id: string;
    invoiceNumber: string;
    clientName: string;
    amount: number;
    daysSinceSent: number;
    /** Sent over 30 days ago -- the threshold for chasing. */
    overdue: boolean;
  }[];
  collections: { sentValue: number; paidValue: number; overdueValue: number };
  /** How paid invoices in range were settled, largest first. */
  paymentMethods: { method: string; count: number; amount: number }[];
};

/** How far back the missing-entry check looks, in days. */
const MISSING_DAY_LOOKBACK = 14;

/**
 * Weekdays in the lookback window with nothing logged, most recent first.
 *
 * Weekdays only: a quiet Sunday is not a gap. Today is excluded because the
 * day is still running. Dates are compared as yyyy-mm-dd strings in Pacific,
 * never as timestamps -- the entry column is date-only and the server clock
 * is UTC, which is what puts an evening's work on tomorrow.
 */
function missingWeekdays(logged: Date[], todayStart: Date): string[] {
  const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(d);
  const have = new Set(logged.map((d) => d.toISOString().slice(0, 10)));
  const missing: string[] = [];

  for (let back = 1; back <= MISSING_DAY_LOOKBACK; back++) {
    // Stepping by whole days from Pacific midnight, then re-reading the day
    // in Pacific, so a DST change cannot skip or repeat one.
    const day = pacificDayStart(new Date(todayStart.getTime() - (back * 24 - 12) * 3_600_000));
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: PACIFIC_TZ,
    }).format(day);
    if (weekday === "Sat" || weekday === "Sun") continue;
    const key = iso(day);
    if (!have.has(key)) missing.push(key);
  }
  return missing;
}

/** Prisma Decimal | number | null -> number. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}

export async function loadDashboardMetrics(
  tx: TxClient,
  args: { userId: string; range: ResolvedRange; monthlyGoal: number },
): Promise<DashboardMetrics> {
  const { userId, range, monthlyGoal } = args;
  const dayStart = pacificDayStart();
  const monthStart = pacificMonthStart();
  const monthEnd = nextMonthStart(monthStart);

  const [
    todayEntries,
    recentEntryDates,
    monthInvoices,
    rangeInvoices,
    unbilled,
    rangeHours,
    ticketRows,
    resolvedInRange,
    activeClients,
    draftInvoices,
    clients,
    sentUnpaid,
    paidInRange,
    recentTickets,
    unbilledDetail,
    paidByMethod,
  ] = await Promise.all([
    tx.timeEntry.aggregate({
      where: { loggedByUserId: userId, createdAt: { gte: dayStart } },
      _count: true,
      _sum: { durationHours: true },
    }),
    // Dates this person logged work FOR over the recent past. Keyed on the
    // entry's own date rather than when it was typed, so catching up on
    // Friday for Tuesday's work correctly clears Tuesday.
    tx.timeEntry.findMany({
      where: {
        loggedByUserId: userId,
        date: { gte: new Date(dayStart.getTime() - MISSING_DAY_LOOKBACK * 86_400_000) },
      },
      select: { date: true },
      distinct: ["date"],
    }),
    // The goal is about invoicing OUTPUT this month, so a draft still counts --
    // the work is captured. Voided invoices never count: they were withdrawn.
    tx.invoice.aggregate({
      where: { voidedAt: null, createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { totalAmount: true },
    }),
    tx.invoice.findMany({
      where: { voidedAt: null, createdAt: { gte: range.start, lt: range.end } },
      select: { totalAmount: true, status: true, createdAt: true, clientId: true },
    }),
    tx.timeEntry.findMany({
      where: { invoiceId: null, billableStatus: "Billable" },
      select: {
        date: true,
        durationHours: true,
        rateOverride: true,
        serviceType: { select: { rateOverride: true, scheduledRate: true, scheduledRateFrom: true } },
        client: {
          select: { billingRate: true, scheduledRate: true, scheduledRateFrom: true },
        },
      },
    }),
    tx.timeEntry.groupBy({
      by: ["billableStatus"],
      where: { date: { gte: range.start, lt: range.end } },
      _sum: { durationHours: true },
    }),
    tx.ticket.groupBy({ by: ["status"], _count: true }),
    tx.ticket.count({ where: { resolvedAt: { gte: range.start, lt: range.end } } }),
    tx.client.count({ where: { activeStatus: true } }),
    tx.invoice.count({ where: { status: "Draft", voidedAt: null } }),
    tx.client.findMany({ select: { id: true, name: true } }),
    // Sent but not paid: the invoices that are actually owed money.
    tx.invoice.findMany({
      // Issued-but-unpaid, whichever way it left: an invoice handed over or
      // posted is owed exactly as much as one that was emailed.
      where: { status: { in: ["Sent", "Invoiced"] }, voidedAt: null },
      select: {
        id: true, invoiceNumber: true, totalAmount: true, sentAt: true, issuedAt: true,
        client: { select: { name: true } },
      },
      orderBy: { sentAt: "asc" },
    }),
    tx.invoice.aggregate({
      where: { status: "Paid", voidedAt: null, paidAt: { gte: range.start, lt: range.end } },
      _sum: { totalAmount: true },
    }),
    tx.ticket.findMany({
      where: { status: { in: ["New", "InProgress", "WaitingOnClient"] } },
      select: {
        id: true, ticketNumber: true, clientCompanyName: true, urgency: true,
        createdAt: true, status: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 5,
    }),
    // Grouped by how the client paid. Ranged on paidAt, not createdAt: the
    // question is which methods brought money IN during the period.
    // Every unbilled billable entry, with its client's rate and cadence. Small
    // enough to total in code, and doing so keeps the cadence rule in one
    // readable place rather than spread across a SQL aggregate.
    tx.timeEntry.findMany({
      where: { invoiceId: null, billableStatus: "Billable" },
      select: {
        date: true,
        durationHours: true,
        rateOverride: true,
        clientId: true,
        serviceType: { select: { rateOverride: true, scheduledRate: true, scheduledRateFrom: true } },
        client: {
          select: {
            name: true,
            billingRate: true,
            billingCadence: true,
            scheduledRate: true,
            scheduledRateFrom: true,
          },
        },
      },
    }),
    tx.invoice.groupBy({
      by: ["paymentMethod"],
      where: { status: "Paid", voidedAt: null, paidAt: { gte: range.start, lt: range.end } },
      _count: true,
      _sum: { totalAmount: true },
    }),
  ]);

  // --- revenue, bucketed by Pacific month -----------------------------------
  const bucketIndex = new Map<number, number>();
  const revenue: RevenueBucket[] = range.buckets.map((b, i) => {
    bucketIndex.set(b.getTime(), i);
    return {
      monthStart: b.toISOString(),
      label: range.buckets.length > 12 ? formatMonthYear(b) : formatMonth(b),
      paid: 0,
      sent: 0,
      draft: 0,
      total: 0,
    };
  });

  const bucketStarts = range.buckets.map((b) => b.getTime()).sort((a, b) => a - b);
  const bucketFor = (at: Date): number => {
    const t = at.getTime();
    let lo = 0;
    let hi = bucketStarts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bucketStarts[mid] <= t) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found === -1 ? -1 : (bucketIndex.get(bucketStarts[found]) ?? -1);
  };

  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const perClient = new Map<string, number>();

  for (const inv of rangeInvoices) {
    const amount = num(inv.totalAmount);
    const i = bucketFor(inv.createdAt);
    if (i >= 0) {
      // Invoiced counts with Sent, not with Draft. Both are real invoices
      // that are out and unpaid; a draft is not yet an invoice at all. The
      // `else` used to sweep Invoiced in with drafts, which understated the
      // month's issued revenue and labelled a finalised invoice "Draft".
      if (inv.status === "Paid") revenue[i].paid += amount;
      else if (inv.status === "Sent" || inv.status === "Invoiced") revenue[i].sent += amount;
      else revenue[i].draft += amount;
      revenue[i].total += amount;
    }
    perClient.set(inv.clientId, (perClient.get(inv.clientId) ?? 0) + amount);
  }

  // --- client share: top 5 + Other -------------------------------------------
  const ranked = [...perClient.entries()]
    .map(([id, amount]) => ({ name: clientNames.get(id) ?? "Unknown", amount }))
    .sort((a, b) => b.amount - a.amount);
  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5);
  const clientShare = {
    top,
    otherAmount: rest.reduce((s, r) => s + r.amount, 0),
    otherCount: rest.length,
    total: ranked.reduce((s, r) => s + r.amount, 0),
  };

  // One rate rule for the whole app -- entry override, then service type,
  // then the client's rate or its scheduled replacement. See
  // lib/billing/rates.ts.
  const rateFor = (e: {
    date: Date;
    rateOverride: unknown;
    serviceType: { rateOverride: unknown; scheduledRate: unknown; scheduledRateFrom: Date | null };
    client: { billingRate: unknown; scheduledRate: unknown; scheduledRateFrom: Date | null };
  }) =>
    resolveRate({
      entryRateOverride: toRate(e.rateOverride),
      serviceTypeRateOverride: toRate(e.serviceType.rateOverride),
      serviceTypeScheduledRate: toRate(e.serviceType.scheduledRate),
      serviceTypeScheduledRateFrom: e.serviceType.scheduledRateFrom,
      clientBillingRate: toRate(e.client.billingRate),
      clientScheduledRate: toRate(e.client.scheduledRate),
      clientScheduledRateFrom: e.client.scheduledRateFrom,
      entryDate: e.date,
    }) ?? 0;

  // --- unbilled pipeline -----------------------------------------------------
  let unbilledHours = 0;
  let unbilledValue = 0;
  for (const e of unbilled) {
    const h = num(e.durationHours);
    unbilledHours += h;
    unbilledValue += h * rateFor(e);
  }

  const billable = num(rangeHours.find((r) => r.billableStatus === "Billable")?._sum.durationHours);
  const nonBillable = rangeHours
    .filter((r) => r.billableStatus !== "Billable")
    .reduce((s, r) => s + num(r._sum.durationHours), 0);

  const statusCount = (s: string) =>
    ticketRows.filter((r) => r.status === s).reduce((n, r) => n + (r._count as number), 0);

  const invoicedThisMonth = num(monthInvoices._sum.totalAmount);
  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);
  const daysElapsed = Math.min(
    daysInMonth,
    Math.floor((dayStart.getTime() - monthStart.getTime()) / 86_400_000) + 1,
  );

  // --- collections ----------------------------------------------------------
  const OVERDUE_AFTER_DAYS = 30;
  const awaitingPayment = sentUnpaid.map((inv) => {
    // Falls back to issuedAt: an invoice that was never marked sent still has
    // an age, and treating it as 0 days old would hide a genuinely overdue
    // one from the chase list.
    const since = inv.sentAt ?? inv.issuedAt;
    const daysSinceSent = since
      ? Math.floor((Date.now() - since.getTime()) / 86_400_000)
      : 0;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client.name,
      amount: num(inv.totalAmount),
      daysSinceSent,
      overdue: daysSinceSent >= OVERDUE_AFTER_DAYS,
    };
  });

  // --- this month vs the unbilled backlog -----------------------------------
  //
  // Kept apart deliberately. Mixing them answers neither question: "what do I
  // still need to bill for August" gets inflated by June work nobody has
  // invoiced, and the backlog disappears into a number that looks like normal
  // month-to-date activity.
  let monthBillableHours = 0;
  let monthBillableValue = 0;
  let monthUnbilledHours = 0;
  let monthUnbilledValue = 0;

  const unbilledByClient = new Map<
    string,
    { name: string; cadence: string; hours: number; value: number; oldest: Date }
  >();

  for (const e of unbilledDetail) {
    const hours = num(e.durationHours);
    const value = hours * rateFor(e);

    if (e.date >= monthStart && e.date < monthEnd) {
      monthUnbilledHours += hours;
      monthUnbilledValue += value;
    }

    const row = unbilledByClient.get(e.clientId) ?? {
      name: e.client.name,
      cadence: e.client.billingCadence,
      hours: 0,
      value: 0,
      oldest: e.date,
    };
    row.hours += hours;
    row.value += value;
    if (e.date < row.oldest) row.oldest = e.date;
    unbilledByClient.set(e.clientId, row);
  }

  // Billable hours logged this month, invoiced or not -- the month's output,
  // as distinct from what is still waiting to be billed.
  const monthEntries = await tx.timeEntry.findMany({
    where: { billableStatus: "Billable", date: { gte: monthStart, lt: monthEnd } },
    select: {
      date: true,
      durationHours: true,
      rateOverride: true,
      serviceType: { select: { rateOverride: true, scheduledRate: true, scheduledRateFrom: true } },
      client: { select: { billingRate: true, scheduledRate: true, scheduledRateFrom: true } },
    },
  });
  for (const e of monthEntries) {
    const hours = num(e.durationHours);
    monthBillableHours += hours;
    monthBillableValue += hours * rateFor(e);
  }

  const CADENCE_DAYS: Record<string, number> = { Monthly: 31, Quarterly: 93 };
  const needsBilling = [...unbilledByClient]
    .map(([clientId, r]) => {
      const oldestEntryDays = Math.floor((Date.now() - r.oldest.getTime()) / 86_400_000);
      return {
        clientId,
        name: r.name,
        cadence: r.cadence,
        oldestEntryDays,
        unbilledHours: Number(r.hours.toFixed(2)),
        unbilledValue: Number(r.value.toFixed(2)),
        // Past the point their cadence allows. Tony's rule is that nothing
        // waits longer than a quarter, whatever the client's normal pattern.
        overdue: oldestEntryDays > (CADENCE_DAYS[r.cadence] ?? 31),
      };
    })
    .sort((a, b) => b.oldestEntryDays - a.oldestEntryDays);

  return {
    thisMonth: {
      billableHours: Number(monthBillableHours.toFixed(2)),
      billableValue: Number(monthBillableValue.toFixed(2)),
      unbilledHours: Number(monthUnbilledHours.toFixed(2)),
      unbilledValue: Number(monthUnbilledValue.toFixed(2)),
    },
    needsBilling,
    today: {
      loggedEntries: todayEntries._count,
      loggedHours: num(todayEntries._sum.durationHours),
      hasLogged: todayEntries._count > 0,
      missingDays: missingWeekdays(recentEntryDates.map((e) => e.date), dayStart),
    },
    goal: {
      target: Math.max(MIN_MONTHLY_TARGET, monthlyGoal),
      billable: Number(monthBillableValue.toFixed(2)),
      billableHours: Number(monthBillableHours.toFixed(2)),
      invoiced: invoicedThisMonth,
      pipeline: unbilledValue,
      ratio: monthBillableValue / Math.max(MIN_MONTHLY_TARGET, monthlyGoal),
      monthLabel: formatMonthYear(monthStart),
      daysElapsed,
      daysInMonth,
    },
    revenue,
    clientShare,
    hours: { billable, nonBillable, unbilledValue, unbilledHours },
    tickets: {
      // WaitingOnClient counts as open: the work isn't finished, and leaving
      // it out of the total would make a blocked ticket disappear from the
      // dashboard entirely rather than merely sit lower down it.
      open: statusCount("New") + statusCount("InProgress") + statusCount("WaitingOnClient"),
      inProgress: statusCount("InProgress"),
      newCount: statusCount("New"),
      waitingOnClient: statusCount("WaitingOnClient"),
      resolvedInRange,
      recent: recentTickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        company: t.clientCompanyName,
        urgency: t.urgency,
        ageDays: Math.floor((Date.now() - t.createdAt.getTime()) / 86_400_000),
      })),
    },
    counts: { activeClients, draftInvoices },
    awaitingPayment,
    collections: {
      sentValue: awaitingPayment.reduce((s, i) => s + i.amount, 0),
      paidValue: num(paidInRange._sum.totalAmount),
      overdueValue: awaitingPayment.filter((i) => i.overdue).reduce((s, i) => s + i.amount, 0),
    },
    paymentMethods: paidByMethod
      .map((r) => ({
        // Paid before the method was recorded -- shown rather than dropped, so
        // the parts still sum to the total collected.
        method: r.paymentMethod ?? "Not recorded",
        count: r._count,
        amount: num(r._sum.totalAmount),
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

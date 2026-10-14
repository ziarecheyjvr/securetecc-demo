import Link from "next/link";
import { Suspense } from "react";
import { requireOrgContext } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDashboardMetrics, resolveRange } from "@/lib/dashboard/metrics";
import { GoalMeter } from "@/components/app/dashboard/goal-meter";
import { RevenueChart } from "@/components/app/dashboard/revenue-chart";
import { ClientShare } from "@/components/app/dashboard/client-share";
import { RangeFilter } from "@/components/app/dashboard/range-filter";
import { TodayStatus } from "@/components/app/dashboard/today-status";
import { TicketAttention } from "@/components/app/dashboard/collections";
import { BillingFocus } from "@/components/app/dashboard/billing-focus";
import { UnbilledAlert } from "@/components/app/dashboard/unbilled-alert";
import { buildGreeting } from "@/lib/greeting";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

type SearchParams = Promise<{ range?: string; from?: string; to?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to);

  // One transaction for the whole page: requireOrgContext's callback runs the
  // dashboard's queries alongside the app-user lookup rather than opening a
  // second withRLS right after it.
  const { appUser, data: metrics } = await requireOrgContext((tx, user) =>
    loadDashboardMetrics(tx, {
      userId: user.id,
      range,
      monthlyGoal: Number(user.organization.monthlyRevenueGoal),
    }),
  );

  const firstName = appUser.name.split(" ")[0];
  // Pacific, not server time: on Vercel the clock is UTC, so at 6pm Pacific
  // it is already tomorrow there -- a greeting from server time would say
  // "good morning" during Tony's evening and land his birthday a day early.
  const greeting = buildGreeting({
    firstName,
    birthMonth: appUser.birthMonth,
    birthDay: appUser.birthDay,
    organizationName: appUser.organization.name,
  });

  return (
    <div className="space-y-6">
      <div>
        {/* The greeting is the one heading that gets the glow -- it's the
            first thing on the first screen, and doing this to every h1 would
            make none of them feel special. */}
        <h1 className="text-glow text-2xl font-semibold tracking-tight text-[var(--teal-ink)]">
          {greeting.headline}
        </h1>
        {greeting.subline && <p className="text-muted-foreground">{greeting.subline}</p>}
      </div>

      <TodayStatus today={metrics.today} firstName={firstName} />

      <UnbilledAlert
        needsBilling={metrics.needsBilling}
        monthlyGoal={Number(appUser.organization.monthlyRevenueGoal)}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GoalMeter goal={metrics.goal} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <StatCard
            href="/time-entries"
            label="Unbilled hours"
            value={`${metrics.hours.unbilledHours}h`}
            hint={`${usd(metrics.hours.unbilledValue)} ready to invoice`}
          />
          <StatCard
            href="/tickets"
            label="Open tickets"
            value={String(metrics.tickets.open)}
            hint={`${metrics.tickets.newCount} new · ${metrics.tickets.inProgress} in progress`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{range.label}</h2>
        <Suspense fallback={null}>
          <RangeFilter current={range.key} from={sp.from} to={sp.to} />
        </Suspense>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Invoiced by month</CardTitle>
          <CardDescription>
            Value of invoices raised each month, split by where each one is in the pipeline. Issued covers anything finalised and unpaid, however it was delivered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* No target line: the target is for billable TIME, and drawing it
              across invoice bars would present one as progress on the other. */}
          <RevenueChart data={metrics.revenue} />
        </CardContent>
      </Card>

      {/* To bill and tickets stay: both are "something needs doing today".
          Sent-vs-paid, the chase list and payment methods moved to
          Accounting -- a receivables ledger is a question you sit down with,
          not one the first screen of the day should be answering. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BillingFocus
          thisMonth={metrics.thisMonth}
          needsBilling={metrics.needsBilling}
          monthLabel={metrics.goal.monthLabel}
        />
        <TicketAttention tickets={metrics.tickets} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by client</CardTitle>
            <CardDescription>Where {range.label.toLowerCase()}&apos;s invoicing came from.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientShare share={metrics.clientShare} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activity</CardTitle>
            <CardDescription>Hours and tickets across {range.label.toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Metric label="Billable hours" value={`${metrics.hours.billable}h`} />
            <Metric label="Non-billable hours" value={`${metrics.hours.nonBillable}h`} />
            <Metric label="Tickets resolved" value={String(metrics.tickets.resolvedInRange)} />
            <Metric label="Active clients" value={String(metrics.counts.activeClients)} />
            <Metric label="Draft invoices" value={String(metrics.counts.draftInvoices)} />
            <Metric
              label="Billable share"
              value={
                metrics.hours.billable + metrics.hours.nonBillable > 0
                  ? `${Math.round((metrics.hours.billable / (metrics.hours.billable + metrics.hours.nonBillable)) * 100)}%`
                  : "—"
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link href={href}>
      <Card className="brackets h-full transition-colors hover:border-accent">
        <CardHeader className="pb-2">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
      </Card>
    </Link>
  );
}

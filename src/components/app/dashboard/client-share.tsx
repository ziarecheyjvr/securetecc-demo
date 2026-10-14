import type { DashboardMetrics } from "@/lib/dashboard/metrics";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const SLOTS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"];

/**
 * Which clients the period's revenue came from.
 *
 * A horizontal stacked bar rather than a pie: client names are long (a pie
 * forces a separate legend and leader lines), and with 30 clients a pie would
 * degenerate into slivers. Everything past the top 5 folds into "Other" --
 * the categorical palette is never cycled to invent a 6th hue.
 *
 * Every row is directly labelled with its value, which is also what satisfies
 * the relief rule for the three light-mode slots that sit under 3:1 contrast.
 */
export function ClientShare({ share }: { share: DashboardMetrics["clientShare"] }) {
  const rows = [
    ...share.top.map((c, i) => ({ ...c, color: SLOTS[i] })),
    ...(share.otherAmount > 0
      ? [{ name: `Other (${share.otherCount} clients)`, amount: share.otherAmount, color: "var(--viz-other)" }]
      : []),
  ];

  if (share.total <= 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No invoiced revenue in this period yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {rows.map((r) => (
          <div
            key={r.name}
            // 2px surface gap between adjacent fills, per mark specs.
            style={{
              width: `${(r.amount / share.total) * 100}%`,
              background: r.color,
              marginRight: 2,
            }}
            title={`${r.name}: ${usd(r.amount)}`}
          />
        ))}
      </div>

      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.name}</span>
            <span className="shrink-0 tabular-nums">{usd(r.amount)}</span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round((r.amount / share.total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

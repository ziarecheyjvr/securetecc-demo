"use client";

import { useState } from "react";
import type { RevenueBucket } from "@/lib/dashboard/metrics";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const SERIES = [
  { key: "paid", label: "Paid", color: "var(--viz-3)" },
  { key: "sent", label: "Issued", color: "var(--viz-1)" },
  { key: "draft", label: "Draft", color: "var(--viz-4)" },
] as const;

/**
 * Monthly invoiced value, stacked by where each invoice is in the pipeline.
 *
 * Stacked rather than three lines because the parts sum to something
 * meaningful (total invoiced) AND the split matters -- a tall bar that's all
 * "Draft" is not the same month as one that's all "Paid".
 *
 * Hand-rolled SVG rather than a charting dependency: the whole app avoids
 * heavyweight deps (Google auth is node:crypto rather than googleapis), and
 * these forms are simple enough that a library would cost ~500KB to save
 * little. Layout is a viewBox with preserveAspectRatio="none" disabled, so it
 * scales responsively without distorting text.
 */
export function RevenueChart({ data, goal = 0 }: { data: RevenueBucket[]; goal?: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 760;
  const H = 260;
  const PAD = { top: 16, right: 16, bottom: 32, left: 56 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxValue = Math.max(goal, ...data.map((d) => d.total), 1);
  const { max: niceMax, ticks } = niceScale(maxValue);
  const y = (v: number) => PAD.top + plotH - (v / niceMax) * plotH;

  const slot = plotW / Math.max(data.length, 1);
  // Thin marks: bars occupy 56% of their slot, leaving generous air.
  const barW = Math.min(48, slot * 0.56);

  const hasData = data.some((d) => d.total > 0);

  return (
    // relative + an absolutely positioned tooltip: showing it must not change
    // the container's height. In normal flow it did, which reflowed the page,
    // moved the chart out from under the cursor, fired mouseleave, hid the
    // tooltip, restored the layout, and re-entered the bar -- a flicker loop.
    <div className="relative w-full">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {goal > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-0 w-4 border-t-2 border-dashed border-foreground/40" />
            Goal {usd(goal)}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[260px] w-full"
        role="img"
        aria-label={`Invoiced value by month, stacked by status${goal > 0 ? `, against a ${usd(goal)} monthly goal` : ""}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {t >= 1000 ? `${Math.round(t / 1000)}k` : Math.round(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          let cursor = 0;
          return (
            <g
              key={d.monthStart}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* Hit target spans the whole slot, not just the bar. */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill={hover === i ? "currentColor" : "transparent"}
                className="text-foreground/[0.04]"
              />
              {SERIES.map((s) => {
                const v = d[s.key];
                if (v <= 0) return null;
                const h = (v / niceMax) * plotH;
                const yTop = y(cursor + v);
                cursor += v;
                return (
                  <rect
                    key={s.key}
                    x={cx - barW / 2}
                    y={yTop}
                    width={barW}
                    // 2px surface gap between stacked segments.
                    height={Math.max(1, h - 2)}
                    rx={3}
                    fill={s.color}
                  />
                );
              })}
              <text
                x={cx}
                y={H - PAD.bottom + 18}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Goal line drawn last so it sits above the bars. */}
        {goal > 0 && goal <= niceMax && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(goal)}
            y2={y(goal)}
            stroke="currentColor"
            className="text-foreground/40"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}

        {!hasData && (
          <text
            x={PAD.left + plotW / 2}
            y={PAD.top + plotH / 2}
            textAnchor="middle"
            className="fill-muted-foreground text-[13px]"
          >
            No invoices in this period yet
          </text>
        )}
      </svg>

      {hover !== null && data[hover] && (
        // pointer-events-none matters as much as the positioning: a tooltip
        // that can sit under the cursor steals the hover from the bar and
        // reintroduces the same loop by a different route.
        <div className="pointer-events-none absolute right-0 top-0 z-10 max-w-[min(20rem,100%)] rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
          <div className="mb-1 font-medium">{data[hover].label}</div>
          <div className="flex flex-col gap-0.5">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 tabular-nums">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label} {usd(data[hover][s.key])}
              </span>
            ))}
            <span className="font-medium tabular-nums">Total {usd(data[hover].total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * An axis that lands on round numbers.
 *
 * Rounding only the MAX up to a 1/2/5 magnitude gives ugly intermediate ticks
 * (a 24.1k max became a 50k axis labelled "38k", with the bars squashed into
 * the bottom half). Picking the STEP first and deriving the max from it keeps
 * every gridline round and the plot filled: 24.1k -> step 5k -> max 25k.
 */
function niceScale(v: number, targetSteps = 5): { max: number; ticks: number[] } {
  if (v <= 0) return { max: 1, ticks: [0, 1] };
  const raw = v / targetSteps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const max = Math.ceil(v / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(t);
  return { max, ticks };
}

"use client";

import { useState } from "react";
import type { TrendPoint } from "@/lib/google/analytics";

/**
 * Visitors over time as bars, one per day (or month for long ranges).
 *
 * Hand-rolled SVG like the dashboard's revenue chart, for the same reason:
 * no charting dependency for a shape this simple.
 */
export function TrafficChart({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 760;
  const H = 220;
  const PAD = { top: 12, right: 12, bottom: 28, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxValue = Math.max(...data.map((d) => d.users), 1);
  const step = maxValue <= 5 ? 1 : Math.ceil(maxValue / 4 / (maxValue > 50 ? 10 : 1)) * (maxValue > 50 ? 10 : 1);
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks = Array.from({ length: niceMax / step + 1 }, (_, i) => i * step);
  const y = (v: number) => PAD.top + plotH - (v / niceMax) * plotH;

  const slot = plotW / Math.max(data.length, 1);
  const barW = Math.max(1, Math.min(28, slot * 0.7));
  // Label roughly every seventh bar so dates never collide on a 90-day range.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full" role="img" aria-label="Visitors over time">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = PAD.left + slot * i;
          const h = (d.users / niceMax) * plotH;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect
                x={x}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill={hover === i ? "currentColor" : "transparent"}
                className="text-foreground/[0.04]"
              />
              {d.users > 0 && (
                <rect x={x + (slot - barW) / 2} y={y(d.users)} width={barW} height={Math.max(1, h)} rx={2} fill="var(--viz-1)" />
              )}
              {i % labelEvery === 0 && (
                <text x={x + slot / 2} y={H - PAD.bottom + 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute right-0 top-0 z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
          <div className="mb-1 font-medium">{data[hover].label}</div>
          <div className="tabular-nums">
            {data[hover].users} visitor{data[hover].users === 1 ? "" : "s"} · {data[hover].sessions} session
            {data[hover].sessions === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}

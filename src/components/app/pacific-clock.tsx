"use client";

import { useEffect, useState } from "react";

/**
 * Pacific-time clock for the app header.
 *
 * Earns its place rather than being decoration: every scheduled job, every
 * invoice period and the daily-reminder window are all Pacific, while the
 * server runs on UTC and staff may not. Having the operative timezone on
 * screen — with PST/PDT named — means "did the digest go out yet" is
 * answerable by looking up.
 *
 * Formatted with an explicit timeZone rather than an offset, so the DST
 * abbreviation comes from the runtime's tz database and switches itself.
 *
 * Renders nothing until mounted: the server would format in UTC and the
 * client in the viewer's zone, which is a guaranteed hydration mismatch.
 */
export function PacificClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    // Ticks on the second. A minute-resolution clock that visibly lags the
    // wall clock looks broken; the cost here is one setState per second.
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Same box as the live clock so the header doesn't reflow on mount.
    return <div className="hidden h-[34px] w-[132px] sm:block" aria-hidden />;
  }

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const zone =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      timeZoneName: "short",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "PT";

  return (
    <div
      className="hidden items-center gap-2 rounded-md border px-3 py-1.5 sm:flex"
      style={{ borderColor: "var(--edge)", background: "rgb(6 225 220 / 0.05)" }}
      title={`Pacific time (${zone}) — the timezone every schedule and billing period uses`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--brand-teal)", boxShadow: "0 0 8px 2px rgb(6 225 220 / 0.7)" }}
      />
      <span className="font-mono text-sm tabular-nums text-accent">{time}</span>
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{zone}</span>
    </div>
  );
}

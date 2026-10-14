"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RANGE_LABELS, type RangeKey } from "@/lib/dashboard/metrics";

const PRESETS = Object.entries(RANGE_LABELS) as [Exclude<RangeKey, "custom">, string][];

/**
 * Time-range control, shared by the dashboard and Reports.
 *
 * State lives in the URL, not React: the range is then shareable, survives a
 * refresh, and lets the page stay a server component that re-queries on
 * navigation rather than shipping every month's data to the client and
 * filtering there.
 */
export function RangeFilter({ current, from, to }: { current: RangeKey; from?: string; to?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  // The page this control is on -- it used to push to a hard-coded
  // "/dashboard", so changing the range on Reports navigated away from
  // Reports. Reported as custom ranges and "last 6 months" being broken:
  // they worked, they just answered on a different page.
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [draft, setDraft] = useState({ from: from ?? "", to: to ?? "" });

  function apply(next: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${q.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={pending || undefined}>
      {PRESETS.map(([key, label]) => (
        <Button
          key={key}
          size="sm"
          variant={current === key ? "default" : "outline"}
          onClick={() => {
            setShowCustom(false);
            apply({ range: key, from: null, to: null });
          }}
        >
          {label}
        </Button>
      ))}
      <Button
        size="sm"
        variant={current === "custom" ? "default" : "outline"}
        onClick={() => setShowCustom((v) => !v)}
      >
        Custom
      </Button>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="h-8 w-[9.5rem]"
            aria-label="From date"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="h-8 w-[9.5rem]"
            aria-label="To date"
          />
          <Button
            size="sm"
            disabled={!draft.from || !draft.to || draft.from > draft.to}
            onClick={() => apply({ range: "custom", from: draft.from, to: draft.to })}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}

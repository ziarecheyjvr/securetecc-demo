"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";

/**
 * Month selector, in the URL so a month is shareable and survives a refresh.
 *
 * A native month input rather than a list of the last N months: a report can
 * be asked for any month, including one from last year, and a dropdown would
 * have to guess how far back to go.
 */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <Input
      type="month"
      value={month}
      disabled={pending}
      aria-label="Month"
      className="h-8 w-[11rem]"
      onChange={(e) => {
        const next = e.target.value;
        if (!next) return;
        const q = new URLSearchParams(params.toString());
        q.set("month", next);
        startTransition(() => router.push(`${pathname}?${q}`, { scroll: false }));
      }}
    />
  );
}

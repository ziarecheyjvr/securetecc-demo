"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * View, period and person, all in the URL.
 *
 * Links rather than state: the Team page stays a server component that
 * re-queries when the week changes, and a particular week or person is
 * shareable -- "here is the week you're asking about" is a URL.
 */
export function TeamCalendarControls({
  view,
  rangeLabel,
  previous,
  next,
  people,
  who,
}: {
  view: "week" | "months";
  rangeLabel: string;
  /** Anchor dates for the arrows, "YYYY-MM-DD". */
  previous: string;
  next: string;
  people: { id: string; name: string }[];
  who: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-[3px] rounded-lg bg-muted p-[3px]">
        {(
          [
            ["week", "Week"],
            ["months", "2 months"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={href({ view: value === "week" ? null : value, at: null })}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              view === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Link
          href={href({ at: previous })}
          className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          aria-label={view === "week" ? "Previous week" : "Previous month"}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-44 text-center text-sm font-medium">{rangeLabel}</span>
        <Link
          href={href({ at: next })}
          className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          aria-label={view === "week" ? "Next week" : "Next month"}
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
        <Link href={href({ at: null })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Today
        </Link>
      </div>

      {people.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={href({ who: null })}
            className={cn(
              "rounded-md px-2 py-1 text-sm",
              who === "all" ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Everyone
          </Link>
          {people.map((p) => (
            <Link
              key={p.id}
              href={href({ who: p.id })}
              className={cn(
                "rounded-md px-2 py-1 text-sm",
                who === p.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.name.split(" ")[0]}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

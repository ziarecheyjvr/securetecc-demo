"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/time-entries", label: "Time entries" },
  { href: "/time-entries/recurring-charges", label: "Recurring charges" },
  { href: "/time-entries/reimbursable-charges", label: "Reimbursable charges" },
];

/**
 * Real navigation between two separate pages, styled to look like tabs --
 * NOT the base-ui Tabs component, which drives client-side content
 * switching rather than routing. Filters on /time-entries live in the URL
 * (bookmarkable, same pattern as ticket-filters.tsx), so each "tab" needs to
 * be a real route rather than client-only state.
 *
 * Reimbursable charges used to be a "Type" value on the time-entries filter
 * bar instead of a tab. That put two controls in charge of the same state --
 * the tab strip said "Time entries" while the dropdown said "Reimbursable
 * expenses" -- and buried a whole category of billable work inside a filter.
 */
export function TimeEntriesTabs() {
  const pathname = usePathname();

  return (
    // Scrolls sideways rather than overflowing: three labels this long are
    // wider than a phone, and the alternative -- abbreviating them -- costs
    // the one thing a tab label is for.
    <div className="flex max-w-full items-center gap-[3px] overflow-x-auto rounded-lg bg-muted p-[3px] sm:inline-flex sm:w-fit">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

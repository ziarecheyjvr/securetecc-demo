"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/accounting/to-bill", label: "To bill" },
  { href: "/accounting/aging", label: "Money owed" },
  { href: "/accounting/payments", label: "Paid & unpaid" },
  { href: "/accounting/profitability", label: "Revenue vs cost" },
  { href: "/accounting/monthly", label: "Monthly position" },
];

/**
 * Accounting's own navigation.
 *
 * A section rather than more cards on the dashboard: the dashboard answers
 * "what do I need to know today", and a receivables ledger is not that. Real
 * routes rather than client-side tabs so each view is bookmarkable and can
 * carry its own filters in the URL.
 */
export function AccountingTabs() {
  const pathname = usePathname();

  return (
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

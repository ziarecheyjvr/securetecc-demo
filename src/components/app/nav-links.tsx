"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItemsFor } from "@/components/app/nav-items";

/**
 * The nav list itself, rendered identically in the sidebar and the mobile
 * drawer.
 *
 * `onNavigate` exists for the drawer: tapping a link has to close it. The
 * sidebar passes nothing, because there is nothing to close.
 */
export function NavLinks({
  role,
  onNavigate,
}: {
  role: "admin" | "technician";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {navItemsFor(role).map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium tracking-wide transition-colors",
              active
                // The active item is the one thing on screen allowed to glow:
                // a bar on the leading edge, a tinted fill and a soft halo.
                // Everything else stays quiet so this reads instantly.
                ? "border-[rgba(6,225,220,0.4)] bg-[rgba(6,225,220,0.12)] text-[#06E1DC] shadow-[0_0_16px_rgba(6,225,220,0.28)] before:absolute before:inset-y-1 before:left-[-1px] before:w-[2px] before:rounded-full before:bg-[#06E1DC] before:shadow-[0_0_10px_#06E1DC]"
                : "border-transparent text-sidebar-foreground/70 hover:border-[rgba(6,225,220,0.18)] hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {/* Sets expectations before the click rather than after it: the
                page still opens and explains itself, but nobody arrives
                expecting working data. Muted rather than accent-coloured --
                it's a caveat, and the accent marks the ACTIVE item, so a
                bright pill would compete with that. */}
            {item.soon && (
              <span className="shrink-0 rounded-full border border-current/25 px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.12em] opacity-60">
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

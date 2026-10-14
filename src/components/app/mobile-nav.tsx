"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NavLinks } from "@/components/app/nav-links";
import { ThemeToggle } from "@/components/app/theme-toggle";

/**
 * The navigation on a phone.
 *
 * The sidebar is `hidden md:flex`, which on a narrow screen left the app with
 * no navigation at all -- every tab unreachable unless you knew the URL. This
 * is the same list in a drawer behind a hamburger, top-left where a hamburger
 * belongs.
 *
 * Written by hand rather than reaching for a drawer library: it needs four
 * behaviours (Escape, click-away, close on navigate, no scrolling behind it)
 * and nothing else.
 */
export function MobileNav({ role }: { role: "admin" | "technician" }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on navigation. Without this the drawer stays open over the page it
  // just opened, which reads as a broken tap.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    // Freeze the page behind the drawer: scrolling the list must not scroll
    // the page under it, which on iOS is otherwise the default.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the panel so a keyboard or screen reader lands inside
    // the thing that just opened rather than back at the top of the page.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
      // Put focus back where it came from. Without this, closing the drawer
      // drops focus on <body> and a keyboard user has to tab from the top of
      // the page again to get anywhere.
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="-ml-1 flex h-10 w-10 items-center justify-center rounded-md border border-transparent text-sidebar-foreground/80 transition-colors hover:border-[rgba(6,225,220,0.2)] hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* The overlay is a button so a tap anywhere off the panel closes
              it -- the gesture everyone already expects from a drawer. */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />

          <div
            id="mobile-nav"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r outline-none"
            style={{
              backgroundColor: "var(--sidebar)",
              borderColor: "var(--sidebar-border)",
            }}
          >
            <div
              className="flex shrink-0 items-center justify-between gap-3 px-4 py-4"
              style={{ borderBottom: "1px solid var(--sidebar-border)" }}
            >
              <Image
                src="/securetecc-logo.png"
                alt="SecureTECC"
                width={1080}
                height={264}
                priority
                className="h-auto w-full max-w-[140px]"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* min-h-0 as well as flex-1: a flex child will not shrink below
                its content without it, so a long nav would push the theme
                toggle off the bottom instead of scrolling itself. */}
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pt-4">
              <p className="label-hud px-3 pb-2 opacity-60">Operations</p>
              <NavLinks role={role} onNavigate={() => setOpen(false)} />
            </nav>

            <div
              className="shrink-0 px-3 pb-4 pt-3"
              style={{ borderTop: "1px solid var(--sidebar-border)" }}
            >
              <p className="label-hud px-1 pb-2 opacity-60">Appearance</p>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

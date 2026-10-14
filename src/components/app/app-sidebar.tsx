"use client";

import Image from "next/image";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { NavLinks } from "@/components/app/nav-links";

export function AppSidebar({ role }: { role: "admin" | "technician" }) {
  return (
    // sticky + h-screen pins the sidebar to the viewport instead of letting
    // it grow with the nav list. Without it the aside is as tall as its
    // content, so the whole page scrolls to reach the theme toggle -- and it
    // gets worse with every tab added.
    <aside
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r md:flex"
      style={{ backgroundColor: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
    >
      <div
        className="relative flex items-center px-5 py-5"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        {/* Same asset as /login and /support, so the logo is identical
            everywhere the brand appears rather than a text approximation. */}
        <Image
          src="/securetecc-logo.png"
          alt="SecureTECC"
          width={1080}
          height={264}
          priority
          className="h-auto w-full max-w-[168px]"
        />
      </div>
      {/* min-h-0 matters as much as flex-1: a flex child's default
          min-height is auto, which refuses to shrink below its content, so
          the nav would push the footer off the bottom rather than scroll
          itself. */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pt-4">
        <p className="label-hud px-3 pb-2 opacity-60">Operations</p>
        <NavLinks role={role} />
      </nav>

      {/* Footer rather than the header: the theme is set once and then left
          alone, so it belongs below the navigation people use all day.
          shrink-0 so it keeps its height and stays on screen when the nav
          above it has to scroll. */}
      <div
        className="shrink-0 px-3 pb-4 pt-3"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <p className="label-hud px-1 pb-2 opacity-60">Appearance</p>
        <ThemeToggle />
      </div>
    </aside>
  );
}

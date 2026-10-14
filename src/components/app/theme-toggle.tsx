"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Light/dark switch for the sidebar footer.
 *
 * A segmented two-option control rather than a single toggling button: with
 * one button you have to work out whether the icon shows the current state or
 * the one you'd switch to, which is a coin flip every time. Here both options
 * are visible and the active one is marked.
 *
 * Renders a same-size placeholder until mounted. The server has no idea which
 * theme the browser stored, so marking either option active before hydration
 * is a guaranteed mismatch -- and a control that flips a moment after paint
 * looks broken.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "light", label: "Light", Icon: Sun },
  ] as const;

  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-md border p-1"
      style={{ borderColor: "var(--sidebar-border)" }}
      role="group"
      aria-label="Colour theme"
    >
      {options.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-[rgba(6,225,220,0.14)] text-[#06E1DC]"
                : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

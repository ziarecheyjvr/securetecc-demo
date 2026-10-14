"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Thin wrapper so the root layout can stay a server component.
 *
 * The class lands on <html> rather than <body>. The original reason the dark
 * class sat on <body> was that base-ui portals (Dialog, Select, Popover,
 * Sonner) render directly under <body> and a class on some wrapper div left
 * them on the wrong theme -- <html> is an ancestor of <body>, so it covers
 * those portals too, and next-themes needs the document element to avoid a
 * flash on first paint.
 *
 * enableSystem is off deliberately. The user asked for a toggle, and a
 * three-state control (light / dark / follow system) is a worse control than
 * a two-state one when the system state is invisible in the UI.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

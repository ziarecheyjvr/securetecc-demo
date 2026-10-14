import Link from "next/link";

/**
 * Shared footer for every public (unauthenticated) page -- /support,
 * /support/status, /privacy, /terms. Centralizing this instead of repeating
 * the same JSX per page means the Privacy/Terms links only had to be added
 * once to reach all of them.
 */
export function PublicFooter() {
  return (
    <footer className="border-t border-[rgba(6,225,220,0.24)] px-6 py-8 text-center text-[13px] text-[rgba(255,255,255,0.55)]">
      <p>SecureTECC Solutions · 877.707.TECC</p>
      <p className="mt-2">
        <Link href="/privacy" className="hover:text-[#06E1DC]">
          Privacy Policy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-[#06E1DC]">
          Terms of Service
        </Link>
      </p>
    </footer>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEMO_LOGIN_EMAIL } from "@/lib/demo";

/**
 * Landing + sign-in page, ported from manage.securetecc.com's v1 static gate
 * (github.com/securetecc/manage) -- same aurora/grain/particle background,
 * splash intro, cursor-tracking compass, staggered entrance, and
 * scroll-reveal tools grid. Glow is ring-only (no filled center orb). The
 * one deliberate difference from the source: the v1 gate is a single shared
 * password (client-side only, not real auth -- see that repo's README);
 * this is real per-user Supabase auth, so the form has an email field
 * alongside password.
 */

const TOOLS = [
  {
    title: "Voice Logger",
    body: "Log billable time by speaking naturally — AI classifies the service type, applies billing minimums, and records it automatically.",
  },
  {
    title: "Manual Time Entry",
    body: "Prefer typing? Log hours directly with a client, date, service type, and description — no voice needed.",
  },
  {
    title: "Client Management",
    body: "Add new clients on the fly — billing rate, contact info, and address feed straight into every future invoice.",
  },
  {
    title: "Invoicing",
    body: "Generate client invoices from logged hours and recurring charges, with a review step before anything goes final.",
  },
  {
    title: "Support Tickets",
    body: "Client requests from the support portal land automatically, with email alerts and status updates handled for you.",
  },
  {
    title: "Reporting",
    body: "Daily reminders, weekly ticket digests, and monthly revenue summaries land in your inbox automatically.",
  },
];

const COMPASS_TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Both of the client-only values below are read through useSyncExternalStore
 * rather than "useState + set it in an effect on mount". Same rendered
 * result, but the effect version is a synchronous setState inside an effect,
 * which cascades an extra render and is what react-hooks/set-state-in-effect
 * flags. useSyncExternalStore is the intended tool for "a value that lives
 * outside React and differs between server and client".
 *
 * The server snapshots (false / no particles) are what SSR emits; React swaps
 * in the client snapshot after hydration.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

type Particle = { left: number; size: number; duration: number; delay: number };

const NO_PARTICLES: Particle[] = [];

/**
 * Cached at module scope so the getSnapshot below returns a stable reference
 * -- returning a fresh array each call would make useSyncExternalStore loop
 * forever. Particles are decorative and never change after first paint, so
 * the subscribe function is a deliberate no-op.
 */
let particlesCache: Particle[] | null = null;

function getParticlesSnapshot(): Particle[] {
  if (prefersReducedMotion()) return NO_PARTICLES;
  particlesCache ??= Array.from({ length: 26 }, () => ({
    left: Math.random() * 100,
    size: 2 + Math.random() * 2.5,
    duration: 14 + Math.random() * 14,
    delay: Math.random() * 20,
  }));
  return particlesCache;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(DEMO_LOGIN_EMAIL);
  const [password, setPassword] = useState("demo");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  // Ambient floating particles -- generated client-side so each load varies.
  const particles = useSyncExternalStore(
    subscribeReducedMotion,
    getParticlesSnapshot,
    () => NO_PARTICLES,
  );

  // Splash timers. With reduced motion there is no splash at all, so both
  // derive to "already finished" below rather than being set in an effect.
  const [splashHeld, setSplashHeld] = useState(false);
  const [splashRemoved, setSplashRemoved] = useState(false);
  const [exiting, setExiting] = useState(false);

  const contentShown = reduceMotion || splashHeld;
  const splashHiding = reduceMotion || splashHeld;
  const splashGone = reduceMotion || splashRemoved;

  const heroRef = useRef<HTMLElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  // Splash intro: hold on the logo, then fade into the page -- identical
  // timing to the v1 site (1.6s hold, 0.8s fade). setState inside setTimeout
  // is asynchronous, so this doesn't cascade a render the way a synchronous
  // setState in the effect body would.
  useEffect(() => {
    if (reduceMotion) return;
    const HOLD_MS = 1600;
    const FADE_MS = 800;
    const holdTimer = setTimeout(() => setSplashHeld(true), HOLD_MS);
    const goneTimer = setTimeout(() => setSplashRemoved(true), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(goneTimer);
    };
  }, [reduceMotion]);

  // Compass needle tracking the cursor within the hero.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || prefersReducedMotion()) return;

    function handleMove(e: MouseEvent) {
      const rect = hero!.getBoundingClientRect();
      const dx = e.clientX - rect.left - rect.width / 2;
      const dy = e.clientY - rect.top - rect.height / 2;
      if (needleRef.current) {
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        needleRef.current.style.transform = `rotate(${angle}deg)`;
      }
    }
    hero.addEventListener("mousemove", handleMove);
    return () => {
      hero.removeEventListener("mousemove", handleMove);
    };
  }, []);

  // Fade the tools grid in once it's scrolled into view.
  useEffect(() => {
    const el = revealRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
      el.classList.add("in-view");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Sends a Supabase recovery email.
   *
   * The response is deliberately identical whether or not the address has an
   * account: this form is reachable by anyone, and a distinct "no such user"
   * would turn it into a way to test which emails are staff.
   */
  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email address first, then choose Forgot your password.");
      return;
    }
    setSendingReset(true);
    setError(null);
    await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    setResetSent(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Only ever follow an internal path -- a bare "/" prefix that isn't also
    // "//..." (a protocol-relative URL browsers treat as external). Without
    // this, ?next=//evil.com is an open redirect off a trusted login page.
    const rawNext = searchParams.get("next");
    const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
    if (reduceMotion) {
      router.push(next);
      router.refresh();
      return;
    }
    // Reuse the splash overlay as an exit transition -- same technique as the
    // v1 site's unlock() -- so the handoff feels continuous rather than a
    // hard reload.
    setExiting(true);
    setTimeout(() => {
      router.push(next);
      router.refresh();
    }, 650);
  }

  const showSplash = !splashGone || exiting;
  const splashVisible = exiting || !splashHiding;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#050F1D] font-[family-name:var(--font-poppins)] text-white">
      <style>{`
        @keyframes auroraDrift {
          0%   { transform: translate(0, 0) scale(1); }
          33%  { transform: translate(-2%, 2%) scale(1.04); }
          66%  { transform: translate(2%, -1%) scale(1.02); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes particleFloat {
          0%   { transform: translateY(0); opacity: 0; }
          8%   { opacity: 0.55; }
          92%  { opacity: 0.4; }
          100% { transform: translateY(-110vh); opacity: 0; }
        }
        @keyframes splashLogoIn {
          0%   { opacity: 0; transform: scale(0.72); filter: blur(18px); }
          40%  { opacity: 1; }
          80%  { filter: blur(0); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        @keyframes staggerIn {
          to { opacity: 1; transform: translateY(0); }
        }
        .stagger-in {
          opacity: 0;
          transform: translateY(16px);
          animation: staggerIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .reveal {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .reveal.in-view {
          opacity: 1;
          transform: translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .stagger-in, .reveal { opacity: 1 !important; transform: none !important; animation: none !important; }
        }
      `}</style>

      {/* Aurora wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-[-10%] z-0 blur-[4px]"
        style={{
          animation: reduceMotion ? undefined : "auroraDrift 22s ease-in-out infinite",
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 20% 15%, rgba(6,225,220,0.10), transparent 60%), radial-gradient(ellipse 50% 35% at 85% 25%, rgba(6,225,220,0.07), transparent 60%), radial-gradient(ellipse 55% 45% at 75% 85%, rgba(6,225,220,0.09), transparent 60%), radial-gradient(ellipse 45% 35% at 10% 80%, rgba(6,225,220,0.06), transparent 60%)",
        }}
      />
      {/* Grain texture */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Floating particles */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-[#06E1DC] opacity-0"
            style={{
              left: `${p.left}vw`,
              bottom: "-10px",
              width: p.size,
              height: p.size,
              boxShadow: "0 0 6px 1px rgba(6,225,220,0.6)",
              animation: `particleFloat linear infinite`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Splash intro / exit overlay */}
      {showSplash && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050F1D] transition-opacity duration-[1200ms]"
          style={{ opacity: splashVisible ? 1 : 0, visibility: splashVisible ? "visible" : "hidden" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(circle at center, rgba(6,225,220,0.10) 0%, transparent 62%)",
            }}
          />
          <Image
            src="/securetecc-logo.png"
            alt="SecureTECC"
            width={320}
            height={78}
            priority
            className="relative w-[320px] max-w-[72vw]"
            style={reduceMotion ? undefined : { animation: "splashLogoIn 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards" }}
          />
        </div>
      )}

      <div
        className="transition-opacity duration-[900ms]"
        style={{ opacity: contentShown ? 1 : 0 }}
      >
        <header className="sticky top-0 z-10 border-b-2 border-[#06E1DC] bg-[#071E37] px-6 py-5 text-center">
          <Image
            src="/securetecc-logo.png"
            alt="SecureTECC"
            width={1080}
            height={264}
            className="mx-auto h-auto w-full max-w-[200px]"
          />
        </header>

        <section
          ref={heroRef}
          className="relative flex min-h-[max(82vh,700px)] items-center justify-center overflow-hidden px-6 pb-10 pt-15"
        >
          {/* Eclipse decorations, hidden below 900px like the reference */}
          <div aria-hidden className="pointer-events-none absolute left-[-450px] top-1/2 hidden h-[900px] w-[900px] -translate-y-1/2 md:block">
            <div
              className="absolute inset-0 rounded-full blur-[60px]"
              style={{ backgroundImage: "radial-gradient(circle at 65% 50%, rgba(6,225,220,0.22), transparent 62%)" }}
            />
            <div className="absolute inset-0 rounded-full border border-[rgba(6,225,220,0.18)]" />
            <div className="absolute inset-[60px] rounded-full border border-[rgba(6,225,220,0.13)]" />
            {!reduceMotion && (
              <>
                <div className="absolute inset-0 origin-center animate-[spin_26s_linear_infinite]">
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-[#06E1DC] shadow-[0_0_12px_3px_rgba(6,225,220,0.6)]" style={{ top: "12%", left: "68%" }} />
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-[#06E1DC] shadow-[0_0_12px_3px_rgba(6,225,220,0.6)]" style={{ top: "48%", left: "92%" }} />
                </div>
                <div className="absolute inset-0 origin-center animate-[spin_38s_linear_infinite_reverse]">
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-[#06E1DC] shadow-[0_0_12px_3px_rgba(6,225,220,0.6)]" style={{ top: "78%", left: "22%" }} />
                </div>
              </>
            )}
          </div>
          <div aria-hidden className="pointer-events-none absolute right-[-450px] top-1/2 hidden h-[900px] w-[900px] -translate-y-1/2 md:block">
            <div
              className="absolute inset-0 rounded-full blur-[60px]"
              style={{ backgroundImage: "radial-gradient(circle at 35% 50%, rgba(6,225,220,0.22), transparent 62%)" }}
            />
            <div className="absolute inset-0 rounded-full border border-[rgba(6,225,220,0.18)]" />
            <div className="absolute inset-[60px] rounded-full border border-[rgba(6,225,220,0.13)]" />
            {!reduceMotion && (
              <>
                <div className="absolute inset-0 origin-center animate-[spin_38s_linear_infinite_reverse]">
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-[#06E1DC] shadow-[0_0_12px_3px_rgba(6,225,220,0.6)]" style={{ top: "20%", left: "30%" }} />
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-[#06E1DC] shadow-[0_0_12px_3px_rgba(6,225,220,0.6)]" style={{ top: "55%", left: "8%" }} />
                </div>
                <div className="absolute inset-0 origin-center animate-[spin_26s_linear_infinite]">
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-[#06E1DC] shadow-[0_0_12px_3px_rgba(6,225,220,0.6)]" style={{ top: "82%", left: "74%" }} />
                </div>
              </>
            )}
          </div>

          {/* Wide arc ring -- scales with viewport so it always bleeds off the
              edges rather than floating as a small fixed-size circle on wide
              screens. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: "max(900px, 85vw)",
              height: "max(900px, 85vw)",
              backgroundImage:
                "radial-gradient(circle, transparent 0%, transparent 42%, rgba(20,216,196,0.14) 46%, rgba(20,216,196,0.05) 52%, transparent 60%)",
            }}
          />

          {/* Compass: three hairline rings, ticks, and a needle that tracks the cursor */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: "max(560px, 52vw)", height: "max(560px, 52vw)" }}
          >
            <div className="absolute inset-0 rounded-full border border-[rgba(6,225,220,0.20)]" />
            <div className="absolute inset-[8%] rounded-full border border-[rgba(6,225,220,0.15)]" />
            <div className="absolute inset-[16%] rounded-full border border-[rgba(6,225,220,0.11)]" />
            {COMPASS_TICKS.map((deg) => (
              <div
                key={deg}
                className="absolute left-1/2 top-0 h-2 w-px bg-[rgba(6,225,220,0.4)]"
                style={{ transformOrigin: "50% max(280px, 26vw)", transform: `rotate(${deg}deg)` }}
              />
            ))}
            <div
              ref={needleRef}
              className="absolute left-1/2 top-1/2 h-px w-[210px] opacity-60 transition-transform duration-[400ms]"
              style={{
                transformOrigin: "0 0",
                backgroundImage: "linear-gradient(90deg, #06E1DC, transparent 88%)",
              }}
            />
            <div className="absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] h-[6px] w-[6px] rounded-full bg-[#06E1DC] shadow-[0_0_14px_3px_rgba(6,225,220,0.55)]" />
          </div>

          <div className="relative z-[2] w-full max-w-[420px] text-center">
            <span
              className="stagger-in mb-6 inline-block rounded-[20px] border border-[rgba(6,225,220,0.24)] bg-[rgba(6,225,220,0.14)] px-[18px] py-[7px] text-xs font-bold uppercase tracking-[2px] text-[#06E1DC]"
              style={{ animationDelay: "3.5s" }}
            >
              Internal Access
            </span>

            <h1
              className="stagger-in text-[clamp(26px,4.5vw,36px)] font-extrabold leading-[1.15] tracking-[-0.02em]"
              style={{ animationDelay: "3.62s" }}
            >
              SecureTECC staff only
            </h1>
            <p
              className="stagger-in mb-8 mt-3 text-[15px] leading-[1.6] text-[rgba(255,255,255,0.74)]"
              style={{ animationDelay: "3.72s" }}
            >
              Sign in to reach the operations tools.
            </p>

            <form
              onSubmit={handleSubmit}
              className="stagger-in rounded-2xl border border-[rgba(6,225,220,0.24)] bg-[#071E37] p-[26px] text-left"
              style={{ animationDelay: "3.84s" }}
            >
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-bold uppercase tracking-[1.5px] text-[#06E1DC]"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-3 w-full rounded-[10px] border border-[rgba(6,225,220,0.24)] bg-[rgba(6,225,220,0.05)] px-4 py-[14px] text-[15px] text-white outline-none transition-colors placeholder:text-[rgba(255,255,255,0.35)] focus:border-[#06E1DC]"
              />

              <label
                htmlFor="password"
                className="mb-2 block text-xs font-bold uppercase tracking-[1.5px] text-[#06E1DC]"
              >
                Password
              </label>
              <div className="relative mb-3">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-[10px] border border-[rgba(6,225,220,0.24)] bg-[rgba(6,225,220,0.05)] py-[14px] pl-4 pr-12 text-[15px] tracking-[1px] text-white outline-none transition-colors focus:border-[#06E1DC]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1 flex h-[calc(100%-8px)] w-10 items-center justify-center text-[#06E1DC]"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <p className="mb-3 rounded-[10px] border border-[rgba(6,225,220,0.24)] bg-[rgba(6,225,220,0.05)] px-4 py-3 text-[13px] leading-relaxed text-[rgba(255,255,255,0.75)]">
                <span className="font-bold text-[#06E1DC]">Demo mode.</span> Every record is
                generated test data. Any password works. Other accounts: tech@, va@ and
                partner@demo.securetecc.example.
              </p>

              {error && (
                <p role="alert" className="mb-3 text-sm text-[#ff8a8a]">
                  {error}
                </p>
              )}

              {resetSent && (
                <p role="status" className="mb-3 text-sm text-[#06E1DC]">
                  If that address has an account, a reset link is on its way.
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="relative w-full overflow-hidden rounded-[10px] bg-[#06E1DC] px-10 py-[15px] text-base font-bold tracking-[0.2px] text-[#071E37] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#1a3050] disabled:text-[rgba(255,255,255,0.3)]"
              >
                {loading ? "Unlocking…" : "Unlock"}
              </button>

              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={sendingReset}
                className="mt-4 w-full text-[13px] text-[rgba(255,255,255,0.55)] underline underline-offset-4 transition-colors hover:text-[#06E1DC] disabled:cursor-not-allowed"
              >
                {sendingReset ? "Sending…" : "Forgot your password?"}
              </button>
            </form>

            <p
              className="stagger-in mt-6 text-[13px] text-[rgba(255,255,255,0.55)]"
              style={{ animationDelay: "3.94s" }}
            >
              SecureTECC Solutions · Internal Tools
            </p>
          </div>
        </section>

        {/* pb-24 was there but nothing on top, so this section butted straight
            against the sign-in card with no separation between them. */}
        <section className="px-6 pt-16 pb-24 sm:pt-24">
          <div ref={revealRef} className="reveal">
            <div className="mx-auto mb-10 max-w-[680px] text-center">
              <p className="mb-[10px] text-xs font-bold uppercase tracking-[2px] text-[#06E1DC]">
                What&apos;s inside
              </p>
              <h2 className="mb-3 whitespace-nowrap text-[clamp(14px,calc((100vw-48px)/18.3),32px)] font-bold">
                Everything the team runs day to day
              </h2>
              <p className="text-[15px] leading-[1.6] text-[rgba(255,255,255,0.74)]">
                One login gets you to all of it — no separate tools to juggle.
              </p>
            </div>

            <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-5 sm:grid-cols-2">
              {TOOLS.map((tool) => (
                <div
                  key={tool.title}
                  className="rounded-[14px] border border-[rgba(6,225,220,0.24)] bg-[#071E37] px-[22px] py-[26px] transition-all duration-200 hover:-translate-y-1 hover:border-[#06E1DC] hover:shadow-[0_14px_30px_-14px_rgba(6,225,220,0.4)]"
                >
                  <h3 className="mb-2 text-[17px] font-bold text-[#06E1DC]">{tool.title}</h3>
                  <p className="text-sm leading-[1.55] text-[rgba(255,255,255,0.74)]">
                    {tool.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="border-t-2 border-[#06E1DC] bg-[#071E37] px-6 py-6 text-center text-[13px]">
          <span className="font-bold text-[#06E1DC]">SecureTECC Solutions</span> · Internal Tools · 877.707.TECC
        </footer>
      </div>
    </div>
  );
}

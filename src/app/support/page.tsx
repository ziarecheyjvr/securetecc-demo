import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm, SupportHeader } from "@/components/app/support-form";
import { recaptchaSiteKey } from "@/lib/recaptcha";
import { PublicFooter } from "@/components/app/public-footer";

export const metadata: Metadata = {
  title: "Submit a support request — SecureTECC",
  description: "Report an IT issue to the SecureTECC support team.",
};

/**
 * Public support portal -- no login. `/support` is already in proxy.ts's
 * PUBLIC_PATHS, so the auth gate lets it through.
 *
 * Lives outside the (app) route group on purpose: it must not render the
 * authenticated sidebar shell.
 */
export default function SupportPage() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#050F1D] font-[family-name:var(--font-poppins)] text-white">
      <SupportHeader />

      <main className="relative overflow-hidden px-6 py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 40% at 20% 10%, rgba(6,225,220,0.10), transparent 60%), radial-gradient(50% 35% at 85% 20%, rgba(6,225,220,0.07), transparent 60%)",
          }}
        />

        <div className="relative z-[2] mx-auto max-w-[640px]">
          <div className="mb-8 text-center">
            <span className="mb-5 inline-block rounded-[20px] border border-[rgba(6,225,220,0.24)] bg-[rgba(6,225,220,0.14)] px-[18px] py-[7px] text-xs font-bold uppercase tracking-[2px] text-[#06E1DC]">
              Support Request
            </span>
            <h1 className="text-[clamp(28px,4.5vw,34px)] font-extrabold leading-[1.15] tracking-[-0.02em]">
              How can we help?
            </h1>
            <p className="mt-3 text-[15px] leading-[1.6] text-[rgba(255,255,255,0.74)]">
              Tell us what&apos;s going on and we&apos;ll get back to you. No account or login
              needed.
            </p>
          </div>

          <div className="rounded-[14px] border border-[rgba(6,225,220,0.24)] bg-[#071E37] p-6 sm:p-8">
            <SupportForm recaptchaSiteKey={recaptchaSiteKey()} />
          </div>

          <p className="mt-6 text-center text-[13px] text-[rgba(255,255,255,0.55)]">
            Urgent and business-stopping? Call us at 877.707.TECC.
          </p>
          <p className="mt-2 text-center text-[13px] text-[rgba(255,255,255,0.55)]">
            Already submitted a request?{" "}
            <Link href="/support/status" className="text-[#06E1DC] underline">
              Check its status
            </Link>
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

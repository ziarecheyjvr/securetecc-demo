import type { Metadata } from "next";
import Link from "next/link";
import { SupportHeader } from "@/components/app/support-form";
import { TicketStatusForm } from "@/components/app/ticket-status-form";
import { PublicFooter } from "@/components/app/public-footer";

export const metadata: Metadata = {
  title: "Check your request status — SecureTECC",
  description: "Look up the status of a support request you've already submitted.",
};

/**
 * Public ticket-status lookup -- no login, same route-group as /support (both
 * outside the (app) group so neither renders the authenticated shell). Covered
 * by proxy.ts's "/support" prefix match in PUBLIC_PATHS already.
 */
export default function TicketStatusPage() {
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
              Check Status
            </span>
            <h1 className="text-[clamp(28px,4.5vw,34px)] font-extrabold leading-[1.15] tracking-[-0.02em]">
              Where&apos;s my request?
            </h1>
            <p className="mt-3 text-[15px] leading-[1.6] text-[rgba(255,255,255,0.74)]">
              Enter your ticket number and the email you submitted it with.
            </p>
          </div>

          <div className="rounded-[14px] border border-[rgba(6,225,220,0.24)] bg-[#071E37] p-6 sm:p-8">
            <TicketStatusForm />
          </div>

          <p className="mt-6 text-center text-[13px] text-[rgba(255,255,255,0.55)]">
            Need to submit a new request instead?{" "}
            <Link href="/support" className="text-[#06E1DC] underline">
              Go back
            </Link>
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

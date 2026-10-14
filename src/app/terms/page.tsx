import type { Metadata } from "next";
import { SupportHeader } from "@/components/app/support-form";
import { PublicFooter } from "@/components/app/public-footer";

export const metadata: Metadata = {
  title: "Terms of Service — SecureTECC",
  description: "The terms that govern use of SecureTECC's support request portal.",
};

const H2 = "mt-10 mb-3 text-xl font-bold text-white";
const P = "mb-4 text-[15px] leading-[1.7] text-[rgba(255,255,255,0.78)]";
const UL = "mb-4 list-disc space-y-2 pl-6 text-[15px] leading-[1.7] text-[rgba(255,255,255,0.78)]";

/**
 * Same scope note as privacy/page.tsx: a starting draft covering use of the
 * support *portal* (this web form), not a full services agreement -- the
 * actual scope/pricing/terms of SecureTECC's IT support engagement with each
 * client is a separate matter between SecureTECC and that client, referenced
 * here rather than restated.
 */
export default function TermsOfServicePage() {
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

        <div className="relative z-[2] mx-auto max-w-[720px]">
          <div className="mb-8 text-center">
            <span className="mb-5 inline-block rounded-[20px] border border-[rgba(6,225,220,0.24)] bg-[rgba(6,225,220,0.14)] px-[18px] py-[7px] text-xs font-bold uppercase tracking-[2px] text-[#06E1DC]">
              Legal
            </span>
            <h1 className="text-[clamp(28px,4.5vw,34px)] font-extrabold leading-[1.15] tracking-[-0.02em]">
              Terms of Service
            </h1>
            <p className="mt-3 text-[13px] text-[rgba(255,255,255,0.55)]">
              Last updated August 22, 2026
            </p>
          </div>

          <div className="rounded-[14px] border border-[rgba(6,225,220,0.24)] bg-[#071E37] p-6 sm:p-10">
            <p className={P}>
              These terms govern your use of SecureTECC&apos;s support request portal (this
              website). By submitting a request through it, you agree to these terms. They
              don&apos;t replace or change any separate service agreement, quote, or invoice
              terms already in place between SecureTECC and your organization — where those
              conflict with this page, the separate agreement controls.
            </p>

            <h2 className={H2}>Using the portal</h2>
            <ul className={UL}>
              <li>Provide accurate contact information so we can actually reach you.</li>
              <li>
                Only submit requests on behalf of your own organization, or with authorization
                to do so.
              </li>
              <li>
                Don&apos;t use the portal to submit abusive, fraudulent, or knowingly false
                reports, or to attempt to access, probe, or disrupt systems you&apos;re not
                authorized to.
              </li>
              <li>
                Files you attach should be relevant to your request (e.g. screenshots, error
                logs) — we scan and restrict what file types are accepted.
              </li>
            </ul>
            <p className={P}>
              We may rate-limit, throttle, or block submissions we reasonably believe are
              abusive, automated, or fraudulent.
            </p>

            <h2 className={H2}>What we provide</h2>
            <p className={P}>
              The portal lets you submit a support request and later check its status using
              your ticket number and email. Response times shown on the form are targets based
              on the urgency you select, not guarantees — actual response times depend on
              staffing, the nature of the issue, and any separate service-level agreement you
              have with us.
            </p>

            <h2 className={H2}>Billing and payment</h2>
            <p className={P}>
              Submitting a request through this portal does not itself create a charge. Billing
              for work performed is governed by the separate service agreement or engagement
              you have with SecureTECC, and invoices are issued and payable as described on
              each invoice.
            </p>

            <h2 className={H2}>Intellectual property</h2>
            <p className={P}>
              The portal itself — its design, code, and branding — belongs to SecureTECC. The
              information and files you submit remain yours; submitting them gives us the
              limited right to use them for the purpose of responding to your request.
            </p>

            <h2 className={H2}>Disclaimers</h2>
            <p className={P}>
              The portal is provided &quot;as is.&quot; We aim for it to be available and
              accurate, but we don&apos;t guarantee it will be uninterrupted, error-free, or
              available at all times. Nothing here limits or modifies any warranty or liability
              terms already set out in a separate service agreement between SecureTECC and your
              organization.
            </p>

            <h2 className={H2}>Changes</h2>
            <p className={P}>
              We may update these terms from time to time; the date at the top of this page
              reflects the latest version. Continuing to use the portal after a change means you
              accept the update.
            </p>

            <h2 className={H2}>Governing law</h2>
            <p className={P}>
              These terms are governed by the laws of the State of California, without regard to
              its conflict-of-laws principles.
            </p>

            <h2 className={H2}>Contact us</h2>
            <p className={P}>
              Questions about these terms? Email{" "}
              <a href="mailto:support@securetecc.com" className="text-[#06E1DC] underline">
                support@securetecc.com
              </a>{" "}
              or call 877.707.TECC.
            </p>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

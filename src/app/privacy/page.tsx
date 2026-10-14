import type { Metadata } from "next";
import { SupportHeader } from "@/components/app/support-form";
import { PublicFooter } from "@/components/app/public-footer";

export const metadata: Metadata = {
  title: "Privacy Policy — SecureTECC",
  description: "How SecureTECC collects, uses, and protects your information.",
};

const H2 = "mt-10 mb-3 text-xl font-bold text-white";
const P = "mb-4 text-[15px] leading-[1.7] text-[rgba(255,255,255,0.78)]";
const UL = "mb-4 list-disc space-y-2 pl-6 text-[15px] leading-[1.7] text-[rgba(255,255,255,0.78)]";
const STRONG = "font-semibold text-white";

/**
 * Public, unauthenticated -- covers the /support ticket portal, which
 * collects name/email/phone/company from the public with no linked policy
 * until now (the gap the security audit flagged). Also covers this app's
 * internal use, since staff data (name, email) flows through the same
 * subprocessors.
 *
 * This is a starting draft, not legal advice -- the bracket-free defaults
 * below (California, "SecureTECC") match this business's own invoice
 * letterhead address, but a lawyer should review before this is relied on.
 */
export default function PrivacyPolicyPage() {
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
              Privacy Policy
            </h1>
            <p className="mt-3 text-[13px] text-[rgba(255,255,255,0.55)]">
              Last updated August 22, 2026
            </p>
          </div>

          <div className="rounded-[14px] border border-[rgba(6,225,220,0.24)] bg-[#071E37] p-6 sm:p-10">
            <p className={P}>
              SecureTECC (&quot;SecureTECC,&quot; &quot;we,&quot; &quot;us,&quot; or
              &quot;our&quot;) provides managed IT support services. This policy explains what
              information we collect through our support request portal and internal systems,
              why we collect it, and how you can ask us about or delete it.
            </p>

            <h2 className={H2}>Information we collect</h2>
            <p className={P}>When you submit a support request, we collect:</p>
            <ul className={UL}>
              <li>Your company name and your own name</li>
              <li>Your email address and, if you provide one, a callback phone number</li>
              <li>The issue type, urgency, and description you write</li>
              <li>Any files you choose to attach (screenshots, documents)</li>
            </ul>
            <p className={P}>
              We also automatically log basic technical information needed to operate the
              portal securely — IP address and request timestamps — used only to prevent abuse
              (for example, rate-limiting repeated submissions) and never sold or used for
              advertising.
            </p>
            <p className={P}>
              If you are SecureTECC staff, your name and email are stored to operate your
              account; your password is managed entirely by our authentication provider
              (Supabase) and is never visible to us in plain text.
            </p>

            <h2 className={H2}>How we use your information</h2>
            <ul className={UL}>
              <li>To respond to and resolve your support request</li>
              <li>To send you confirmation and status-update emails about that request</li>
              <li>
                To improve response quality — for example, a staff member may dictate a
                work-log entry that is processed by an AI service (see below) to help fill in a
                time-tracking form for internal review before it is saved
              </li>
              <li>To detect and prevent abuse of the public request form</li>
            </ul>

            <h2 className={H2}>Who we share it with</h2>
            <p className={P}>
              We don&apos;t sell your information. We use a small number of service providers
              (&quot;subprocessors&quot;) to run this portal, each of whom only receives what
              they need to perform their function:
            </p>
            <ul className={UL}>
              <li>
                <span className={STRONG}>Supabase</span> — hosts our database, file storage, and
                staff authentication.
              </li>
              <li>
                <span className={STRONG}>Resend</span> — delivers our transactional emails
                (ticket confirmations, status updates, invoices).
              </li>
              <li>
                <span className={STRONG}>Google (Gemini API)</span> — used internally by
                SecureTECC staff to convert a spoken work summary into a draft time-log entry.
                This is a staff tool, not something triggered by a public support request, and
                every AI-drafted entry is reviewed by a human before being saved.
              </li>
              <li>
                <span className={STRONG}>Vercel</span> — hosts the application itself.
              </li>
            </ul>
            <p className={P}>
              We may also disclose information if required by law, or to protect the rights,
              property, or safety of SecureTECC, our clients, or others.
            </p>

            <h2 className={H2}>How long we keep it</h2>
            <p className={P}>
              Support ticket records are kept for as long as needed for support history and our
              own business records (including anything relevant to invoicing or billing
              disputes), and are not indefinitely retained beyond that. You can ask us to delete
              your information sooner — see &quot;Your rights&quot; below.
            </p>

            <h2 className={H2}>Cookies</h2>
            <p className={P}>
              The public support form itself sets no cookies. Our internal staff application
              uses a single, necessary session cookie to keep a staff member logged in; we don&apos;t
              run advertising or third-party tracking cookies anywhere on this site.
            </p>

            <h2 className={H2}>Security</h2>
            <p className={P}>
              We apply reasonable technical safeguards — encrypted connections (HTTPS)
              everywhere, database-level access controls scoping every query to the right
              organization, and private file storage with time-limited access links — but no
              method of transmission or storage is 100% secure, and we can&apos;t guarantee
              absolute security.
            </p>

            <h2 className={H2}>Your rights</h2>
            <p className={P}>
              You can ask us what information we hold about you, request a copy of it, ask us to
              correct it, or ask us to delete it, by emailing{" "}
              <a href="mailto:support@securetecc.com" className="text-[#06E1DC] underline">
                support@securetecc.com
              </a>
              . We&apos;ll respond within a reasonable time. Deleting information tied to an
              active or unresolved support request may limit our ability to continue helping
              with that request.
            </p>

            <h2 className={H2}>Children&apos;s privacy</h2>
            <p className={P}>
              Our services are intended for business use and are not directed at children. We
              don&apos;t knowingly collect information from anyone under 16.
            </p>

            <h2 className={H2}>Changes to this policy</h2>
            <p className={P}>
              If we make material changes, we&apos;ll update the date at the top of this page.
              Continued use of our support portal after a change means you accept the updated
              policy.
            </p>

            <h2 className={H2}>Contact us</h2>
            <p className={P}>
              Questions about this policy or your information? Email{" "}
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

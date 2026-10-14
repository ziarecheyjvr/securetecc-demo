import { Resend } from "resend";
import { safeMode, SAFE_MODE_NOTICE } from "@/lib/safe-mode";

export type SendResult =
  | { ok: true; id: string | null; redirectedFrom?: string }
  | { ok: false; error: string; skipped?: boolean };

export type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  /** Sender for this message. Invoices use invoiceFromEmail; everything else supportEmail. */
  from: string;
  /** Display name shown in the inbox. Defaults to "SecureTECC Support". */
  fromName?: string;
  replyTo?: string;
  /**
   * Hard gate. Every caller must pass the org's emailDomainVerified value --
   * sending from an unverified domain gets the whole domain marked as spam,
   * which is expensive to undo, so nothing sends until onboarding flips this.
   */
  emailDomainVerified: boolean;
};

/**
 * Test mode: send everything to one inbox instead of the real recipients.
 *
 * Set EMAIL_REDIRECT_TO to an address and NOTHING can reach a client, no
 * matter which code path fires or what address is on the ticket. The gate
 * lives here rather than at the call sites because here it cannot be
 * forgotten: every outbound message in the app funnels through sendEmail, so
 * a new notification added later inherits the protection automatically.
 *
 * Deliberately keyed on the presence of an ADDRESS rather than a boolean
 * flag: a truthy "EMAIL_TEST_MODE=1" with nowhere to send would have to
 * either drop mail silently or fall back to the real recipient, and both are
 * bad failure modes. An address is unambiguous.
 */
function redirectTarget(): string | null {
  const target = process.env.EMAIL_REDIRECT_TO?.trim();
  return target ? target : null;
}

/** Banner making it obvious at a glance that a message was intercepted. */
function testBanner(originalTo: string): string {
  return `<div style="margin:0;padding:12px 16px;background:#FFF3CD;border-bottom:3px solid #E0A800;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4A3800;">
  <strong>TEST MODE.</strong> This was addressed to <strong>${originalTo}</strong> and redirected here. The real recipient received nothing.
</div>`;
}

/**
 * Thin wrapper over Resend.
 *
 * Never throws: a failed notification must not take down the action that
 * triggered it (a ticket submission or an invoice send is the real work; the
 * email is a side effect). Callers surface the returned error as a warning.
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  // First gate, ahead of everything: safe mode BLOCKS rather than redirects.
  // A redirect still leaves a message in flight, and the point of safe mode
  // is that nothing leaves the process at all.
  if (safeMode()) {
    return { ok: false, skipped: true, error: SAFE_MODE_NOTICE };
  }

  if (!args.emailDomainVerified) {
    return {
      ok: false,
      skipped: true,
      error: "Email domain is not verified for this organization — nothing was sent.",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY is not configured." };
  }

  // Applied after the verification and API-key gates so test mode can never
  // turn a would-be no-op into a real send.
  const redirect = redirectTarget();
  const originalTo = Array.isArray(args.to) ? args.to.join(", ") : args.to;
  const to = redirect ?? args.to;
  const subject = redirect ? `[TEST -> ${originalTo}] ${args.subject}` : args.subject;
  const html = redirect ? testBanner(originalTo) + args.html : args.html;

  if (redirect) {
    // Loud, because a redirect left on in production means clients silently
    // stop hearing from us -- the kind of failure nobody notices for weeks.
    console.warn(`[email] TEST MODE: "${args.subject}" for ${originalTo} redirected to ${redirect}`);
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      // Display name, so inboxes show "SecureTECC Support" rather than the
      // bare "noreply" local-part. Only added when the caller passed a plain
      // address -- a from that already carries a name is left alone.
      from: args.from.includes("<") ? args.from : `${args.fromName ?? "SecureTECC Support"} <${args.from}>`,
      to,
      subject,
      html,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null, ...(redirect ? { redirectedFrom: originalTo } : {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed." };
  }
}

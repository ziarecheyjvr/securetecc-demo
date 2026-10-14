/**
 * reCAPTCHA v3 verification for the public ticket form.
 *
 * v3 rather than a checkbox: the ticket form is the front door for clients
 * with a problem, and making someone identify traffic lights before they can
 * report that their email is down is a poor first impression. v3 scores the
 * request invisibly and only the score is acted on.
 *
 * Both keys are optional. With none configured this is a no-op that reports
 * success, so the form keeps working in development and on any deployment
 * where the keys have not been added yet -- the IP rate limiter is still in
 * front of it either way. Verification only becomes mandatory once a secret
 * exists, which is the point at which someone has decided to use it.
 */
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** Google's own guidance: 0.5 is the usual "probably human" line. */
const MIN_SCORE = 0.5;

export function recaptchaSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || null;
}

/**
 * Enforced only when BOTH keys exist.
 *
 * Checking the secret alone was a trap: environment variables are added one
 * at a time, and a deploy that picked up the secret before the site key would
 * have had the server demanding a token the page never sends -- rejecting
 * every client's ticket until the second key arrived. With either key
 * missing the check stays off and the IP rate limiter is what stands in front
 * of the form, exactly as before reCAPTCHA existed.
 */
export function recaptchaConfigured(): boolean {
  return Boolean(
    process.env.RECAPTCHA_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim(),
  );
}

export type RecaptchaResult = { ok: true; score?: number } | { ok: false; error: string };

export async function verifyRecaptcha(
  token: string | null,
  expectedAction: string,
): Promise<RecaptchaResult> {
  // Half-configured is treated as not configured -- see recaptchaConfigured.
  if (!recaptchaConfigured()) return { ok: true };
  const secret = process.env.RECAPTCHA_SECRET_KEY!.trim();

  if (!token) {
    return { ok: false, error: "Couldn't verify that you're human. Reload the page and try again." };
  }

  let payload: {
    success?: boolean;
    score?: number;
    action?: string;
    "error-codes"?: string[];
  };
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      // Google being slow must not hang a ticket submission for 300 seconds,
      // which is exactly the failure this app has already had once.
      signal: AbortSignal.timeout(10_000),
    });
    payload = await response.json();
  } catch {
    // Fail OPEN on a network error. A client reporting an outage cannot be
    // told to come back when Google is reachable; the rate limiter still
    // bounds the damage.
    return { ok: true };
  }

  if (!payload.success) {
    return { ok: false, error: "Couldn't verify that you're human. Please try again." };
  }
  // A valid token from another form on the site should not pass here.
  if (payload.action && payload.action !== expectedAction) {
    return { ok: false, error: "That verification didn't match this form. Please try again." };
  }
  if (typeof payload.score === "number" && payload.score < MIN_SCORE) {
    return {
      ok: false,
      error:
        "This looked automated, so it wasn't submitted. If you're a person, email " +
        "support@securetecc.com and we'll pick it up from there.",
    };
  }

  return { ok: true, score: payload.score };
}

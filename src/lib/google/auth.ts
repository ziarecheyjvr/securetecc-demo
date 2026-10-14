/**
 * Google service-account auth with domain-wide delegation, for acting as
 * the invoicing mailbox against the Gmail API.
 *
 * Service account + DWD rather than user OAuth, deliberately: securetecc.com
 * is Google Workspace, so DWD is available, and it has no refresh token to
 * silently expire months later and break invoice drafting with no warning.
 * The tradeoff is one-time setup in the Workspace Admin console -- see
 * docs/google-setup.md.
 *
 * Everything here FAILS CLOSED when the env vars are absent, matching how
 * Resend sending and the cron routes already behave: an unconfigured
 * integration must refuse loudly, never half-work.
 */

import { safeMode } from "@/lib/safe-mode";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.compose";

export type GoogleConfig = {
  clientEmail: string;
  privateKey: string;
  /** The Workspace user the service account impersonates. */
  impersonate: string;
};

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super(
      "Google Workspace isn't connected yet. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, " +
        "GOOGLE_PRIVATE_KEY, and GOOGLE_IMPERSONATED_USER.",
    );
  }
}

/**
 * Normalises however the private key survived its trip through a dashboard.
 *
 * The raw value reaches us in one of several shapes depending on how it was
 * pasted, and every wrong one fails identically and unhelpfully at signing
 * time with OpenSSL's "error:1E08010C:DECODER routines::unsupported":
 *
 *  - copied out of the JSON WITH its surrounding double quotes;
 *  - escaped \n sequences (what a .env file must use);
 *  - real newlines (what the Vercel dashboard stores);
 *  - CRLF line endings, or the whole PEM collapsed onto one line.
 *
 * Rather than demand one exact format, accept them all and repair the body,
 * because the failure is silent until someone clicks Create Gmail draft.
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  // Strip a wrapping pair of quotes -- the single most common paste mistake.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();

  const header = "-----BEGIN PRIVATE KEY-----";
  const footer = "-----END PRIVATE KEY-----";

  // A PEM whose newlines were eaten entirely: rebuild it by re-wrapping the
  // base64 body at 64 characters, which is what the format requires.
  if (key.includes(header) && !key.includes("\n")) {
    const body = key.slice(key.indexOf(header) + header.length, key.indexOf(footer)).replace(/\s+/g, "");
    key = [header, ...(body.match(/.{1,64}/g) ?? []), footer].join("\n");
  }

  // Markers missing entirely -- the value is the bare base64 body. That's a
  // real paste outcome (selecting the key's contents without its first and
  // last lines), and it decodes fine once the banners are put back. Guarded
  // on the body actually being base64 so genuinely wrong values still fail
  // loudly instead of being wrapped into a plausible-looking bad key.
  if (!key.includes("-----BEGIN")) {
    const body = key.replace(/\s+/g, "");
    if (body.length > 100 && /^[A-Za-z0-9+/=]+$/.test(body)) {
      key = [header, ...(body.match(/.{1,64}/g) ?? []), footer].join("\n");
    }
  }

  return key.endsWith("\n") ? key : `${key}\n`;
}

/**
 * A description of the configured key that is safe to show in an error.
 *
 * Deliberately reports only structure -- total length, whether the PEM
 * markers are present, how many lines it has, and the first line (which is
 * the public "-----BEGIN ...-----" banner, not key material). Never any
 * base64 from the body. Without this, a key that fails to decode gives no
 * signal at all about WHY, and the value can't be read back out of Vercel to
 * inspect by hand.
 */
export function describeConfiguredKey(): string {
  const raw = process.env.GOOGLE_PRIVATE_KEY;
  if (!raw) return "GOOGLE_PRIVATE_KEY is not set at all.";

  const normalized = normalizePrivateKey(raw);
  const rawFirstLine = normalized.split("\n")[0] ?? "";
  const looksLikeJson = raw.trimStart().startsWith("{");
  // Echo the first line ONLY when it's a PEM banner or JSON punctuation --
  // both public. If the markers are missing, that first line IS base64 key
  // material, so report its shape instead of its contents.
  const firstLine =
    rawFirstLine.startsWith("-----") || looksLikeJson
      ? rawFirstLine.slice(0, 40)
      : `<${rawFirstLine.length} chars of non-PEM text>`;

  return [
    `length=${raw.length}`,
    `lines=${normalized.split("\n").length}`,
    `hasBegin=${normalized.includes("-----BEGIN")}`,
    `hasEnd=${normalized.includes("-----END")}`,
    looksLikeJson ? "looksLikeWholeJsonObject=true" : null,
    `startsWith=${JSON.stringify(firstLine)}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Null (rather than throwing) so UI can render a "not connected" state. */
export function readGoogleConfig(): GoogleConfig | null {
  // Safe mode reports Google as unconfigured rather than blocking further
  // down. Every caller already handles "not connected" gracefully -- the
  // Drive/Gmail buttons disable themselves and archiving degrades to a
  // warning -- so reusing that path means safe mode needs no new error
  // handling anywhere, and getGoogleAccessToken inherits it too.
  if (safeMode()) return null;

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const impersonate = process.env.GOOGLE_IMPERSONATED_USER?.trim();

  if (!clientEmail || !rawKey || !impersonate) return null;
  return { clientEmail, privateKey: normalizePrivateKey(rawKey), impersonate };
}

export function isGoogleConfigured(): boolean {
  return readGoogleConfig() !== null;
}

/**
 * The service account's own credentials, with no impersonation target.
 *
 * Google Analytics is not a Workspace API: access is granted by adding the
 * service account to the GA4 property as a user, so it authenticates as
 * ITSELF. Requiring GOOGLE_IMPERSONATED_USER here would tie Analytics to a
 * setting it never uses.
 */
function readServiceAccount(): { clientEmail: string; privateKey: string } | null {
  if (safeMode()) return null;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !rawKey) return null;
  return { clientEmail, privateKey: normalizePrivateKey(rawKey) };
}

/** A token for the service account acting as itself (no domain-wide delegation). */
export async function getServiceAccountToken(scope: string): Promise<string> {
  const account = readServiceAccount();
  if (!account) throw new GoogleNotConfiguredError();
  return mintAccessToken({ ...account, scope });
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mints a short-lived access token via the JWT bearer flow.
 *
 * Signed with node:crypto rather than adding googleapis (~of dependency
 * weight) for what is one RS256 signature and one fetch.
 */
export async function getGoogleAccessToken(scope = GMAIL_SCOPE): Promise<string> {
  const config = readGoogleConfig();
  if (!config) throw new GoogleNotConfiguredError();
  return mintAccessToken({
    clientEmail: config.clientEmail,
    privateKey: config.privateKey,
    subject: config.impersonate, // the DWD impersonation target
    scope,
  });
}

async function mintAccessToken(args: {
  clientEmail: string;
  privateKey: string;
  /** Omitted when the service account acts as itself. */
  subject?: string;
  scope: string;
}): Promise<string> {
  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: args.clientEmail,
      ...(args.subject ? { sub: args.subject } : {}),
      scope: args.scope,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);

  let signature: string;
  try {
    signature = base64Url(signer.sign(args.privateKey));
  } catch (err) {
    // OpenSSL reports a malformed key as "error:1E08010C:DECODER
    // routines::unsupported", which says nothing about what to fix. Every
    // realistic cause is the same one: GOOGLE_PRIVATE_KEY isn't a clean PEM.
    throw new Error(
      "GOOGLE_PRIVATE_KEY could not be read as a private key. Copy the " +
        "`private_key` VALUE from the service-account JSON without the " +
        "surrounding double quotes, starting at -----BEGIN PRIVATE KEY----- " +
        "and ending at -----END PRIVATE KEY-----, then redeploy. " +
        `What is currently configured: ${describeConfiguredKey()}. ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Google's error body names the actual cause (bad key, DWD not granted,
    // scope not authorized) -- surfacing it beats a generic failure, and it
    // contains no secret material.
    throw new Error(`Google token request failed (${response.status}): ${await response.text()}`);
  }

  const { access_token: accessToken } = (await response.json()) as { access_token?: string };
  if (!accessToken) throw new Error("Google token response contained no access_token.");
  return accessToken;
}

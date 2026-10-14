/**
 * Builds an RFC 2822 message with a file attachment, base64url-encoded for
 * the Gmail API's `raw` field.
 *
 * Written by hand rather than pulling in a mail library: this needs exactly
 * one shape (an HTML body plus one PDF), and the encoding rules that matter
 * here are few enough to state outright --
 *
 *  - Headers must be CRLF-delimited, and a bare LF anywhere makes Gmail
 *    reject or silently mangle the message.
 *  - Base64 payloads must be wrapped at 76 chars per RFC 2045; Gmail accepts
 *    unwrapped input but some downstream clients don't.
 *  - The boundary must not appear in any part's content. A random suffix
 *    makes that collision effectively impossible.
 *  - Non-ASCII in a Subject has to be encoded-word wrapped, or it arrives as
 *    mojibake -- client names carry accents and em-dashes routinely here.
 */

export type MimeMessage = {
  to: string;
  from: string;
  subject: string;
  /**
   * The covering note, as plain text. Invoices go out as a short note with the
   * PDF attached -- the invoice itself carries the branding, so a styled body
   * would only duplicate it, and a plain note reads like something a person
   * actually wrote rather than a system notification.
   *
   * This is always sent, as the alternative part: a mail client that won't
   * render HTML still shows a readable message.
   */
  text: string;
  /**
   * Optional HTML alternative -- in practice, the same note plus the sender's
   * saved signature, which is the one part that has to be HTML to look like
   * anything. Omit it and the message stays text-only.
   */
  html?: string;
  attachment: { filename: string; content: Buffer; mimeType: string };
};

const CRLF = "\r\n";

/** RFC 2047 encoded-word, needed for any header value that isn't plain ASCII. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately testing for non-ASCII
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(input: string): string {
  return (input.match(/.{1,76}/g) ?? []).join(CRLF);
}

/** Gmail's `raw` field wants base64url (RFC 4648 §5), not standard base64. */
export function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBoundary(tag: string): string {
  return `----securetecc_${tag}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function base64Part(contentType: string, body: string): string[] {
  return [
    `Content-Type: ${contentType}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(body, "utf8").toString("base64")),
    "",
  ];
}

export function buildMimeMessage(message: MimeMessage): string {
  const boundary = randomBoundary("mixed");
  const altBoundary = randomBoundary("alt");

  // With an HTML alternative the body becomes multipart/alternative nested
  // inside multipart/mixed -- the attachment sits beside the body part, not
  // beside each representation of it. Flattening the two into one
  // multipart/mixed is the classic mistake: clients then show the plain-text
  // version AND the HTML version stacked, rather than choosing.
  const bodyPart = message.html
    ? [
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        "",
        `--${altBoundary}`,
        ...base64Part("text/plain", message.text),
        `--${altBoundary}`,
        ...base64Part("text/html", message.html),
        `--${altBoundary}--`,
        "",
      ]
    : base64Part("text/plain", message.text);

  const lines = [
    `To: ${message.to}`,
    `From: ${message.from}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    ...bodyPart,
    `--${boundary}`,
    `Content-Type: ${message.attachment.mimeType}; name="${message.attachment.filename}"`,
    `Content-Disposition: attachment; filename="${message.attachment.filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(message.attachment.content.toString("base64")),
    "",
    `--${boundary}--`,
    "",
  ];

  return lines.join(CRLF);
}

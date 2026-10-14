/**
 * Wraps a plain-text covering note as HTML so a saved signature can ride
 * along underneath it.
 *
 * The note itself stays visually plain -- the point of the HTML part is the
 * signature, not a styled message. Blank lines become paragraph breaks, which
 * is the only formatting the note carries.
 */
export function noteWithSignatureHtml(text: string, signatureHtml: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px">${block.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">` +
    `${paragraphs}<div style="margin-top:16px">${signatureHtml}</div></div>`
  );
}

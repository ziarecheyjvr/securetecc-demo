type MeasureFn = typeof measureTextWidth & { _canvas?: HTMLCanvasElement };

/**
 * SecureTECC email-signature builder.
 *
 * Ported verbatim from the standalone generator Tony already uses daily
 * ("SecureTECC Email Signature 2026 (New Version).html"). The function body
 * and every constant below are UNCHANGED, deliberately: this markup is the
 * product of a long run of real-device testing against Gmail, Gmail mobile,
 * New Outlook and Outlook Classic, and each odd-looking decision in here is
 * a fix for something that actually broke. The comments came across with it
 * because they are the record of which.
 *
 * What DID change is only the surrounding chrome -- the standalone page's
 * form and dark-cyberpunk styling are replaced by the app's own components,
 * so the tool matches the rest of the platform. The signature it emits is
 * byte-identical to what Tony copies today.
 *
 * Runs client-side only: measureTextWidth needs a real <canvas> to measure
 * the rendered title, which is what lets the underline bar be baked out at
 * the exact width of whatever position is typed.
 */

function measureTextWidth(text: string, font: string, letterSpacingPx: number): number {
  const canvas = (measureTextWidth as MeasureFn)._canvas ?? ((measureTextWidth as MeasureFn)._canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  const raw = ctx.measureText(text).width;
  const extra = Math.max(0, text.length - 1) * letterSpacingPx;
  return Math.round(raw + extra);
}

export function buildSignatureHTML(
  name: string,
  position: string,
  mobile: string,
  email: string,
  backgroundUrl?: string,
): string {
  // Points directly at the original, full-resolution assets — no local
  // re-hosting, no upload step. Logo/icons/stars/review badge are plain
  // <img width height> tags, which scale correctly in every client
  // including Outlook Classic, so using the originals here is safe.
  //
  // The full-card background is a different case: it isn't a scalable
  // <img>, it's a table-cell background, and getting this right took two
  // wrong turns worth recording:
  //
  // 1. background-size:100% 100% (stretch) — in Gmail, the table box
  //    itself could render wider than its declared 900px, and the
  //    stretched image grew right along with it while the fixed-width
  //    content inside did not, leaving an empty band of background on
  //    one side. Fixed by adding width="900" (an HTML attribute, not
  //    just CSS) to the table and its key cells — the older, blunter
  //    mechanism survives paste-sanitization more reliably than CSS.
  //
  // 2. Having fixed the width, it seemed simplest to also pin an exact
  //    height="450" and drop background-size entirely (native size, no
  //    scaling) — but a <td> height attribute is only a MINIMUM, and the
  //    real render height depends on which font the browser actually
  //    uses. This builder page has IBM Plex Sans loaded via its own
  //    <link>, so it measured short; an actual email body never loads
  //    that font and falls back to Segoe UI/Arial, which render taller —
  //    tall enough to exceed 450px, spilling the tagline out below the
  //    (non-scaling) image entirely. Confirmed by force-rendering this
  //    exact output with Arial substituted for every font, matching what
  //    a real inbox actually sees.
  //
  // The fix that survives both problems: keep width="900" (proven fix
  // for #1), drop the height pin and let the box grow with content as it
  // did originally, and use background-size:cover instead of stretch or
  // none. Cover always fully fills the box no matter how tall content
  // ends up being — for any font, any name/title length — at the cost of
  // a very mild, essentially invisible zoom/crop instead of a visible
  // gap or empty band.
  //
  // No bgcolor/background-color fallback: the image itself has a soft
  // ~45px transparent margin around the rounded card (that's what makes
  // the glow fade naturally, rather than end in a hard edge). A solid
  // fallback color painted underneath shows through that soft edge as a
  // flat rectangle the instant the image DOES load — a real bug seen in
  // Gmail, not a hypothetical. The tradeoff: if the image is ever fully
  // blocked, the white text has no fallback surface and is unreadable.
  // That's accepted here in favour of a correct result in the common
  // case (image loads) over a hedge against the rare one (it doesn't).
  //
  // Known open issue: real Outlook Classic testing showed the background
  // image not rendering at all there (neither the attribute nor CSS),
  // which — combined with no fallback color — makes every white-text
  // element on the card invisible in Outlook. A fix for this (flattening
  // the image onto solid navy so a fallback color can safely return) was
  // tried and then reverted at the user's request; this tradeoff is
  // currently back to favouring Gmail correctness over Outlook.
  const BASE = "https://securetecc.com/wp-content/uploads/2026/08/";
  // Card background is now user-selectable (see the Appearance step in
  // the form) — falls back to the original default if none was passed in.
  const CARD_BG = backgroundUrl || (BASE + "SECURETECC-New-Email-Signature.jpg");

  // Card was originally designed at 900px. Mobile clients can't be given
  // a different size than desktop from one signature (see note below), so
  // instead the whole design targets a smaller base size — every number
  // below is derived from the original 900px values via SCALE, rather
  // than hand-typed, so nothing can drift out of proportion the way the
  // underline width once silently did when only the font-size changed.
  const SCALE = 600 / 900;
  const S = (px: number) => Math.round(px * SCALE);

  const CARD_WIDTH = 700;              // manual exact value, user request (was 600)
  const CARD_PAD_V = 25;               // manual exact value, user request
  const CARD_PAD_H = 25;               // manual exact value, user request (was 35)
  // CONTENT_WIDTH is derived from the card/padding above, not independently
  // scaled, so shrinking the padding automatically grows usable width
  // rather than leaving an unexplained gap somewhere.
  const CONTENT_WIDTH = CARD_WIDTH - CARD_PAD_H * 2; // 536
  const LOGO_COL = 250;                 // manual exact value, user request (was 225) — kept in sync with LOGO_IMG_W below
  const SPACER_1 = 25;                 // manual — pulls contact column closer to logo/name
  const SPACER_2 = S(18);              // 12
  const ICON_COL = S(70);              // 47 — fixed size, doesn't need the reclaimed width
  // LEFT_BLOCK_WIDTH and CONTACT_COL absorb whatever width padding freed up.
  const LEFT_BLOCK_WIDTH = CONTENT_WIDTH - SPACER_2 - ICON_COL; // 477
  const CONTACT_COL = LEFT_BLOCK_WIDTH - LOGO_COL - SPACER_1; // 239

  const LOGO_IMG_W = 250;               // manual exact value, user request (was 225), matches LOGO_COL above
  const LOGO_IMG_H = 60;                // scaled to match 320:77 source aspect ratio (was 54)
  const LOGO_MARGIN_B = S(20);         // 13
  const NAME_FONT = 35;                 // manual exact value, user request (was 30)
  const TITLE_FONT = 16;                // manual exact value, user request (was 14)
  const TITLE_MARGIN_T = S(9);         // 6
  const UNDERLINE_MARGIN_T = S(6);     // 4

  const CONTACT_FONT = 14;             // bumped from 10.75 to cross the ~14px Gmail-mobile-app auto-boost threshold (see Design Notes)
  const CONTACT_MARGIN_T = S(10);      // 7
  const CONTACT_PAD_R = 3;             // manual — pulls labels and values closer together
  const CONTACT_PAD_B = S(4);          // 3
  // Measured (not guessed) so the label column is only ever as wide as
  // "TOLL FREE" — the widest label — actually requires. table-layout:fixed
  // on this table needs an explicit width on the first row's cells or it
  // splits the two columns evenly instead, which was pushing values far
  // to the right regardless of CONTACT_PAD_R.
  // Measured against Arial specifically, not the real font-family stack.
  // This builder page has IBM Plex Sans loaded, so measuring with the
  // stack (which picks Plex first) undercounts by ~5px versus what real
  // recipients see — no email client loads the web font, so Arial/Segoe
  // UI is the honest worst case. That 5px gap was enough to squeeze the
  // value column and trigger unwanted mid-word breaks (see below);
  // confirmed on a real device, "TOLL FREE" + "877.707.TECC" split into
  // "877.707.TEC" / "C".
  const contactLabelFont = `700 ${CONTACT_FONT}px Arial, sans-serif`;
  // Safety margin widened from 5 to 18 after a real-device comparison:
  // Outlook's mobile app rendered TOLL FREE/OFFICE/MOBILE on one line
  // each, but Gmail's mobile app wrapped them — OFFICE/MOBILE even broke
  // mid-word ("OFFIC"/"E") despite these cells having white-space:nowrap
  // set. Outlook's app renders the pasted table close to as-authored;
  // Gmail's app reflows fixed-width table columns more aggressively for
  // its narrow viewport and doesn't fully honour nowrap while doing it.
  // The 5px margin (sized against this builder's own desktop Arial
  // metrics) wasn't enough slack to survive that reflow. This isn't a
  // guaranteed fix — Gmail's app-side reflow behaviour isn't something
  // CSS can fully opt out of — but it gives real headroom.
  const CONTACT_LABEL_W = measureTextWidth('TOLL FREE', contactLabelFont, 0) + 18;

  const REVIEW_MARGIN_T = 12;           // manual exact value, user request — extra space above the review row (was 5)
  const REVIEW_PAD_R = S(8);           // 5
  const REVIEW_FONT = 13.75;            // manual exact value, user request (was 8.5)
  // "Review us on" wrapped to two lines in the same real-device Gmail
  // test above, despite white-space:nowrap — this table has no width
  // attribute at all (auto layout), so it got no hard hint to resist
  // Gmail's app-side reflow the way an explicit HTML width does
  // elsewhere in this file. Giving it one, with the same margin logic
  // as CONTACT_LABEL_W above.
  const reviewLabelFont = `700 ${REVIEW_FONT}px Arial, sans-serif`;
  const REVIEW_LABEL_W = measureTextWidth('Review us on', reviewLabelFont, 1) + 18;
  const STARS_W = S(65);               // 43
  const STARS_H = S(23);               // 15
  const GOOGLE_W = 42;                  // manual exact value, user request (was 38)

  const TAGLINE_PAD_T = REVIEW_MARGIN_T; // matches the review row's top spacing exactly, per user request (was 20, fixed at 12)
  const TAGLINE_FONT = 14;              // bumped from 10.75 to cross the ~14px Gmail-mobile-app auto-boost threshold (see Design Notes)

  const ICON_SIZE = 40;                // manual exact value, user request (was 35)
  const ICON_GAP = S(5);               // 3
  const ICON_PILL_PAD_V = S(7);        // 5
  const ICON_PILL_PAD_H = S(10);       // 7
  const ICON_PILL_RADIUS = S(10);      // 7

  const LETTER_SPACING = Math.round(2.5 * SCALE * 10) / 10; // px, scaled from 2.5 — title only, see Design Notes if this needs to change
  const TAGLINE_LETTER_SPACING = 0.5;   // manual exact value, user request — kept separate from the title's LETTER_SPACING above
  const titleFont = `700 ${TITLE_FONT}px 'IBM Plex Sans', 'Segoe UI', Arial, sans-serif`;
  const underlineWidth = measureTextWidth(position.toUpperCase(), titleFont, LETTER_SPACING);

  // Ring/glow constants. Two earlier versions of this got the ring
  // colours wrong. v1/v2 mixed the border cyan into the card's own
  // near-black, which read as a dark box on a real (white) email body —
  // no visible glow. v3 flipped that and mixed toward solid white
  // instead — better, but that bakes in an assumption that the
  // recipient's background is white specifically, and a flat opaque
  // ring still doesn't read as a true glow so much as a light halo
  // shape. Fixed by making the rings semi-transparent cyan
  // (rgba(6,225,220, alpha), same hue as the border) instead of any
  // opaque colour — alpha blending lets whatever is actually behind the
  // signature (white, a dark-mode email theme, anything) show through,
  // so the glow adapts instead of assuming one background. Most
  // saturated/opaque closest to the card, fading toward fully
  // transparent at the outer edge.
  const RING1_PAD = S(6);               // 4 — closest to card, most opaque
  const RING1_COLOR = 'rgba(6,225,220,0.38)';
  const RING1_RADIUS = S(18);           // 12
  const RING2_PAD = S(7);               // 5
  const RING2_COLOR = 'rgba(6,225,220,0.18)';
  const RING2_RADIUS = S(22);           // 15
  const RING3_PAD = S(8);               // 5 — outermost, most transparent
  const RING3_COLOR = 'rgba(6,225,220,0.07)';
  const RING3_RADIUS = S(26);           // 17
  const CARD_RADIUS = S(14);            // 9
  const GLOW_SHADOW = '0 0 18px rgba(6,225,220,0.55), 0 0 40px rgba(6,225,220,0.3)';

  // One continuous row per icon inside a single shared pill outline —
  // not a separate box per icon (border-collapse:separate keeps the
  // radius from being dropped, as elsewhere in this file).
  const iconRow = (href: string, src: string, alt: string, isLast: boolean) => `
          <tr><td style="padding-bottom:${isLast ? 0 : ICON_GAP}px;">
            <a href="${href}" target="_blank" style="display:block;"><img src="${src}" width="${ICON_SIZE}" height="${ICON_SIZE}" alt="${alt}" style="display:block; border:0;"></a>
          </td></tr>`;

  // A <style>/@media approach was tried here and removed: most webmail
  // providers, Gmail included, strip <style> blocks from RECEIVED mail
  // server-side as a security measure — independent of what composed the
  // message, and different from the separate, already-known issue of
  // Outlook stripping <style> on paste. Confirmed by a real device test:
  // the address column line-wrapped differently than on desktop, which
  // only happens if content is laying out at full native pixel widths,
  // unshrunk — a CSS zoom/transform would have kept every wrap point
  // identical to desktop, just smaller. With no reliable way to detect
  // "narrow screen" from inline-only styles, there's no email-safe way to
  // show one size on desktop and a smaller one on mobile from a single
  // signature. See the Design Notes tab for what this means practically.
  // Outer glow/border is built the same way as the light-theme signature's
  // ring technique: concentric table cells with solid background-color,
  // not box-shadow (Gmail/Outlook strip box-shadow on a <td> for most
  // recipients) and not baked into the background image's own edges (the
  // repeated failure mode above — any mismatch between the image's design
  // height and the card's real content height cropped directly into a
  // border/glow that lived at the image's edges). The new background
  // (SECURETECC-New-Email-Signature.jpg) is a plain, edge-neutral ambient
  // texture with nothing critical near its borders, so a cover crop from
  // a height mismatch is now genuinely invisible — this is what actually
  // ends the cycle of regenerating a pixel-matched background on every
  // content change, rather than one more attempt at a tighter match.
  return `
<div style="-webkit-text-size-adjust:none; -ms-text-size-adjust:none; text-size-adjust:none;">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
  <tr>
<td style="padding:${RING3_PAD}px; background-color:${RING3_COLOR}; border-radius:${RING3_RADIUS}px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
    <tr>
      <td style="padding:${RING2_PAD}px; background-color:${RING2_COLOR}; border-radius:${RING2_RADIUS}px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
          <tr>
            <td style="padding:${RING1_PAD}px; background-color:${RING1_COLOR}; border-radius:${RING1_RADIUS}px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="${CARD_WIDTH}" style="width:${CARD_WIDTH}px; border-collapse:separate;">
  <tr>
<td width="${CARD_WIDTH}" bgcolor="#0a1119" background="${CARD_BG}" style="width:${CARD_WIDTH}px; background-color:#0a1119; background-image:url('${CARD_BG}'); background-size:cover; background-repeat:no-repeat; background-position:center; border:1px solid #06e1dc; border-radius:${CARD_RADIUS}px; padding:${CARD_PAD_V}px ${CARD_PAD_H}px; box-shadow:${GLOW_SHADOW}; -webkit-text-size-adjust:none; -ms-text-size-adjust:none; text-size-adjust:none;">

  <table role="presentation" cellpadding="0" cellspacing="0" width="${CONTENT_WIDTH}" style="width:${CONTENT_WIDTH}px; table-layout:fixed; font-family:'IBM Plex Sans','Segoe UI',Arial,sans-serif;">
    <tr>
      <td width="${LEFT_BLOCK_WIDTH}" style="width:${LEFT_BLOCK_WIDTH}px; vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="${LEFT_BLOCK_WIDTH}" style="width:${LEFT_BLOCK_WIDTH}px; table-layout:fixed;">
          <tr>
      <td width="${LOGO_COL}" style="width:${LOGO_COL}px; vertical-align:top; overflow:hidden;">
        <img src="${BASE}Untitled-design-1.png" width="${LOGO_IMG_W}" height="${LOGO_IMG_H}" alt="SecureTECC" style="display:block; border:0; margin-bottom:${LOGO_MARGIN_B}px;">
        <div style="font-size:${NAME_FONT}px; font-weight:700; color:#ffffff; line-height:1.1; word-break:break-word; -webkit-text-size-adjust:none; text-size-adjust:none;">${name}</div>
        <div style="font-size:${TITLE_FONT}px; font-weight:700; letter-spacing:${LETTER_SPACING}px; text-transform:uppercase; color:#ffffff; margin-top:${TITLE_MARGIN_T}px; word-break:break-word; -webkit-text-size-adjust:none; text-size-adjust:none;">${position}</div>
        <div style="width:${underlineWidth}px; max-width:100%; height:2px; background-color:#06e1dc; margin-top:${UNDERLINE_MARGIN_T}px; font-size:1px; line-height:1px;">&nbsp;</div>
      </td>

      <td width="${SPACER_1}" style="width:${SPACER_1}px; font-size:1px; line-height:1px;">&nbsp;</td>

      <td width="${CONTACT_COL}" style="width:${CONTACT_COL}px; vertical-align:top; font-size:${CONTACT_FONT}px; font-weight:700; color:#ffffff; line-height:1.45; overflow:hidden; word-break:break-word; -webkit-text-size-adjust:none; text-size-adjust:none;">
        <div>365 E Avenida De Los Arboles</div>
        <div>Mail Box #220</div>
        <div>Thousand Oaks, CA 91360</div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="${CONTACT_COL}" style="width:${CONTACT_COL}px; table-layout:fixed; margin-top:${CONTACT_MARGIN_T}px; font-size:${CONTACT_FONT}px; -webkit-text-size-adjust:none; text-size-adjust:none;">
          <tr>
            <td width="${CONTACT_LABEL_W}" style="width:${CONTACT_LABEL_W}px; padding:0 ${CONTACT_PAD_R}px ${CONTACT_PAD_B}px 0; font-weight:700; color:#ffffff; white-space:nowrap; vertical-align:middle;">TOLL FREE</td>
            <td style="padding:0 0 ${CONTACT_PAD_B}px 0; font-weight:700; color:#ffffff; vertical-align:middle; overflow-wrap:break-word; word-wrap:break-word;">877.707.TECC</td>
          </tr>
          <tr>
            <td style="padding:0 ${CONTACT_PAD_R}px ${CONTACT_PAD_B}px 0; font-weight:700; color:#ffffff; white-space:nowrap; vertical-align:middle;">OFFICE</td>
            <td style="padding:0 0 ${CONTACT_PAD_B}px 0; font-weight:700; color:#ffffff; vertical-align:middle; overflow-wrap:break-word; word-wrap:break-word;">805.888.8322</td>
          </tr>
          <tr>
            <td style="padding:0 ${CONTACT_PAD_R}px ${CONTACT_PAD_B}px 0; font-weight:700; color:#ffffff; white-space:nowrap; vertical-align:middle;">MOBILE</td>
            <td style="padding:0 0 ${CONTACT_PAD_B}px 0; font-weight:700; color:#ffffff; vertical-align:middle; overflow-wrap:break-word; word-wrap:break-word;">${mobile}</td>
          </tr>
          <tr>
            <td style="padding:0 ${CONTACT_PAD_R}px ${CONTACT_PAD_B}px 0; font-weight:700; color:#ffffff; white-space:nowrap; vertical-align:middle;">EMAIL</td>
            <td style="padding:0 0 ${CONTACT_PAD_B}px 0; vertical-align:middle; overflow-wrap:break-word; word-wrap:break-word;"><a href="mailto:${email}" style="color:#ffffff; font-weight:700; text-decoration:none;">${email}</a></td>
          </tr>
          <tr>
            <td style="padding:0 ${CONTACT_PAD_R}px 0 0; font-weight:700; color:#ffffff; white-space:nowrap; vertical-align:middle;">WWW</td>
            <td style="padding:0; vertical-align:middle; overflow-wrap:break-word; word-wrap:break-word;"><a href="http://www.securetecc.com" target="_blank" style="color:#ffffff; font-weight:700; text-decoration:none;">securetecc.com</a></td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:${REVIEW_MARGIN_T}px;">
          <tr>
            <td style="vertical-align:middle; padding-right:${REVIEW_PAD_R}px;"><img src="${BASE}8.png" width="${STARS_W}" height="${STARS_H}" alt="5 stars" style="display:block; border:0;"></td>
            <td width="${REVIEW_LABEL_W}" style="width:${REVIEW_LABEL_W}px; vertical-align:middle; padding-right:${REVIEW_PAD_R}px; font-size:${REVIEW_FONT}px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#ffffff; white-space:nowrap; -webkit-text-size-adjust:none; text-size-adjust:none;">Review us on</td>
            <td style="vertical-align:middle;"><a href="https://g.page/r/CamrbqJU1959EAI/review" target="_blank" style="display:inline-block;"><img src="${BASE}7.png" width="${GOOGLE_W}" height="${GOOGLE_W}" alt="Google Reviews" style="display:block; border:0;"></a></td>
          </tr>
        </table>
      </td>
          </tr>
          <tr>
            <td colspan="3" style="padding-top:${TAGLINE_PAD_T}px; font-family:'IBM Plex Sans','Segoe UI',Arial,sans-serif; font-size:${TAGLINE_FONT}px; font-weight:700; letter-spacing:${TAGLINE_LETTER_SPACING}px; text-transform:uppercase; line-height:1.4; color:#ffffff; -webkit-text-size-adjust:none; text-size-adjust:none;">
              Reliable 24/7 IT Support, backed by 30+ years of experience and a commitment to being a trusted partner to your business.
            </td>
          </tr>
        </table>
      </td>

      <td width="${SPACER_2}" style="width:${SPACER_2}px; font-size:1px; line-height:1px;">&nbsp;</td>

      <td width="${ICON_COL}" style="width:${ICON_COL}px; vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
          <tr>
            <td style="border:1px solid #06e1dc; border-radius:${ICON_PILL_RADIUS}px; padding:${ICON_PILL_PAD_V}px ${ICON_PILL_PAD_H}px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                ${iconRow("https://www.facebook.com/securetecc", BASE + "1.png", "Facebook", false)}
                ${iconRow("https://www.instagram.com/securetecc", BASE + "2.png", "Instagram", false)}
                ${iconRow("https://www.linkedin.com/company/securetecc/", BASE + "3.png", "LinkedIn", false)}
                ${iconRow("https://securetecc.com/", BASE + "4.png", "TikTok", false)}
                ${iconRow("https://securetecc.com/", BASE + "5.png", "X", false)}
                ${iconRow("https://securetecc.com/", BASE + "6.png", "YouTube", true)}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

</td>
  </tr>
</table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</td>
  </tr>
</table>
</div>`;
}


export const BACKGROUND_OPTIONS = [
  "https://securetecc.com/wp-content/uploads/2026/08/SECURETECC-New-Email-Signature.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/SECURETECC-New-Email-Signature-1.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/3.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/4.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/5.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/6.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/7.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/8.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/9.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/10.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/11.jpg",
  "https://securetecc.com/wp-content/uploads/2026/08/12.jpg"
];
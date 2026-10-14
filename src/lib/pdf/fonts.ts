import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * The master template's two typefaces, registered for react-pdf.
 *
 * Montserrat carries every heading, label and figure; Quattrocento Sans is
 * used only for the line-item amount column, exactly as the spreadsheet does.
 * Without these the document silently falls back to Helvetica, which is the
 * single biggest reason the rendered invoice didn't look like the template.
 *
 * The .woff files are vendored into the repo rather than pulled from a CDN or
 * read out of node_modules: rendering happens server-side inside a serverless
 * function, so a network fetch per render would be both slow and a new
 * failure mode, and node_modules paths aren't reliably traced into the
 * bundle. next.config.ts lists this directory in outputFileTracingIncludes
 * for the same reason the logo PNG is listed.
 *
 * WOFF (not WOFF2) because fontkit -- what react-pdf parses fonts with --
 * reads WOFF directly; WOFF2's Brotli table compression it won't decode.
 */
const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");
const file = (name: string) => path.join(FONT_DIR, name);

export const HEADING_FONT = "Montserrat";
export const AMOUNT_FONT = "Quattrocento Sans";

let registered = false;

/**
 * Idempotent: Font.register throws on a duplicate family, and in a warm
 * serverless container this module outlives a single render.
 */
export function registerInvoiceFonts(): void {
  if (registered) return;

  Font.register({
    family: HEADING_FONT,
    fonts: [
      { src: file("montserrat-latin-400-normal.woff"), fontWeight: 400 },
      { src: file("montserrat-latin-700-normal.woff"), fontWeight: 700 },
      { src: file("montserrat-latin-700-italic.woff"), fontWeight: 700, fontStyle: "italic" },
    ],
  });

  Font.register({
    family: AMOUNT_FONT,
    fonts: [{ src: file("quattrocento-sans-latin-400-normal.woff"), fontWeight: 400 }],
  });

  // Long descriptions are the only place a line can need breaking, and the
  // default hyphenation splits words mid-token in a way the spreadsheet never
  // does. Returning the word whole lets it wrap at spaces instead.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}

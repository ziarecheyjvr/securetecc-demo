import { StyleSheet } from "@react-pdf/renderer";
import { AMOUNT_FONT, HEADING_FONT } from "./fonts";

/**
 * Geometry transcribed from the master template
 * ("Invoice Template MASTER", sheet "Invoice", gid 529553600) rather than
 * eyeballed, so the PDF and the spreadsheet agree cell for cell.
 *
 *   columns  A:112  B:330  C:89  D:80  E:121  px  (732 total)
 *   rows     1:9  2:103  3:48  4:22  5-12:17  13-36:26  37:34  px
 *   colours  navy #071E37, teal #06E1DC, label #003366, tint #BFFDFC
 *
 * The sheet's pixels are converted to PDF points at 0.75 (96dpi -> 72dpi), so
 * the 732px content block lands at 549pt -- comfortably inside LETTER's
 * 612pt width with the 31.5pt side margins below.
 */
export const NAVY = "#071E37";
export const TEAL = "#06E1DC";
export const LABEL_BLUE = "#003366";
export const AMOUNT_TINT = "#BFFDFC";

/**
 * Sheet px -> PDF pt.
 *
 * 96dpi -> 72dpi is exactly 0.75, but at that ratio the template's columns
 * come to 549pt and its rows to 732pt, which leaves too little room on
 * LETTER. Google Sheets prints this template with fit-to-page scaling for the
 * same reason; 0.715 is that factor, applied uniformly so every proportion in
 * the template is preserved exactly.
 */
const SHEET_SCALE = 0.715;
const px = (n: number) => n * SHEET_SCALE;

export const COL = {
  date: px(112),
  description: px(330),
  hours: px(89),
  rate: px(80),
  amount: px(121),
};
/** The template shows a fixed 18-row grid (rows 14-31) whether or not it's full. */
export const CONTENT_WIDTH = COL.date + COL.description + COL.hours + COL.rate + COL.amount;
/** Centres the template's own width on the page rather than imposing a margin. */
export const PAGE_MARGIN = (612 - CONTENT_WIDTH) / 2;

export const TEMPLATE_ROW_COUNT = 18;
export const ROW_HEIGHT = px(26);

/**
 * Height of the repeating header block (title band + letterhead + table
 * header), reserved as page padding.
 *
 * It has to be a constant because the block is positioned absolutely: a
 * `fixed` element left in normal flow gets its height counted on EVERY page
 * including the first, which pushed a 3-row invoice onto a second page.
 * Absolute + fixed draws it once per page without consuming flow, and this
 * padding is what stops the rows rendering underneath it.
 *
 * Derived from the template's own row heights (rows 2-13), not measured by
 * eye, so it stays correct if SHEET_SCALE changes.
 */
const TITLE_BAND_H = px(103) + 2;
// The template allots rows 3-12 (206px) to the letterhead, but at our font
// sizes the block only fills ~100pt of that, and reserving the full 206
// pushed the 18-row grid onto a second page. 160px is the smallest value
// that still clears the tallest letterhead (name + 7 detail lines).
const LETTERHEAD_H = px(160);
const TABLE_HEADER_H = ROW_HEIGHT + 2;
export const HEADER_HEIGHT =
  TITLE_BAND_H + px(6) + LETTERHEAD_H + px(10) + TABLE_HEADER_H;
/**
 * Breathing room above the INVOICE band. 32pt is the most the layout can give
 * it: every point here comes out of the flow below, and 40 pushed the totals
 * onto a second page.
 */
export const PAGE_TOP = 32;

const border = { borderWidth: 1, borderColor: NAVY, borderStyle: "solid" as const };

/**
 * What a grid row actually renders at. minHeight is only a floor -- the real
 * height is the 8pt line box plus the vertical padding derived from it below.
 */
const RENDERED_ROW_H = 9.6 + 2 * ((ROW_HEIGHT - 9.6) / 2) + 1;
const GRID_TOP = PAGE_TOP + HEADER_HEIGHT;
const GRID_HEIGHT = RENDERED_ROW_H * TEMPLATE_ROW_COUNT;

/** Watermark artwork is 900x1039; keep the aspect and fit inside the grid. */
const WATERMARK_W = 260;
const WATERMARK_H = WATERMARK_W * (1039 / 900);

export const styles = StyleSheet.create({
  page: {
    // Reserves the absolutely-positioned header block on every page.
    paddingTop: PAGE_TOP + HEADER_HEIGHT,
    paddingBottom: 16,
    paddingHorizontal: PAGE_MARGIN,
    fontFamily: HEADING_FONT,
    fontSize: 8,
    color: NAVY,
  },

  /**
   * Background watermark, sized to sit INSIDE the line-item grid rather than
   * bleeding past it into the totals.
   *
   * The numbers are derived, not eyeballed: the grid starts at
   * PAGE_TOP + HEADER_HEIGHT and runs TEMPLATE_ROW_COUNT rows of RENDERED_ROW_H
   * (which is padding-driven, so slightly taller than ROW_HEIGHT). The mark's
   * height follows from its 900x1039 aspect, and the top centres it in what's
   * left. Change the row count or the header and it re-centres itself.
   *
   * Absolute + fixed so it repeats per page without taking flow height, and
   * declared BEFORE everything else in the tree so it paints behind them --
   * react-pdf has no z-index, so paint order is document order.
   */
  watermark: {
    position: "absolute",
    top: GRID_TOP + (GRID_HEIGHT - WATERMARK_H) / 2,
    left: (612 - WATERMARK_W) / 2,
    width: WATERMARK_W,
    // No opacity: the asset's own alpha already carries the template's fade.
    // Dimming it again would wash it out entirely.
  },

  /** The repeating block. Absolute so `fixed` costs no flow height. */
  pageHeader: {
    position: "absolute",
    top: PAGE_TOP,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
  },
  /** Fixed so the header's height never depends on how much text it holds. */
  letterheadBlock: { height: LETTERHEAD_H },

  // --- row 2: the INVOICE band (merged A2:E2) ------------------------------
  titleBand: {
    height: px(103),
    backgroundColor: NAVY,
    ...border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  logo: { height: px(52), objectFit: "contain" },
  invoiceWord: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontSize: 26,
    color: TEAL,
    textAlign: "right",
  },

  // --- rows 3-12: letterhead left, meta right ------------------------------
  letterhead: { flexDirection: "row", marginTop: px(6) },
  billerBlock: { width: COL.date + COL.description, paddingRight: 10 },
  billerName: { fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 20, color: NAVY },
  billerLine: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontSize: 8,
    color: NAVY,
    lineHeight: 1.35,
  },

  metaBlock: { width: COL.hours + COL.rate + COL.amount },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  // Labels are bold-italic Montserrat in the template's #003366, not the body navy.
  metaLabel: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: 9,
    color: LABEL_BLUE,
  },
  metaValue: { fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 8, textAlign: "right" },
  metaGap: { height: px(11) },

  // --- row 13: table header -------------------------------------------------
  tableHeader: { flexDirection: "row", marginTop: px(10) },
  th: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontSize: 9,
    color: NAVY,
    backgroundColor: TEAL,
    textAlign: "center",
    paddingVertical: (ROW_HEIGHT - 10.8) / 2,
    ...border,
    // Collapse the shared edge so adjacent cells don't render a 2pt rule.
    borderRightWidth: 0,
  },
  thLast: { borderRightWidth: 1 },

  // --- rows 14-31: the fixed 18-row grid ------------------------------------
  row: { flexDirection: "row", minHeight: ROW_HEIGHT },
  cell: {
    fontSize: 8,
    paddingHorizontal: 4,
    // (ROW_HEIGHT - 8pt line box) / 2. Set by arithmetic rather than taste:
    // padding drives the real row height here, and minHeight only acts as a
    // floor, so an over-generous value silently makes every one of the 18
    // rows taller and pushes the totals onto a second page.
    paddingVertical: (ROW_HEIGHT - 9.6) / 2,
    ...border,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  cellLast: { borderRightWidth: 1 },
  cellAmount: { fontFamily: AMOUNT_FONT, fontSize: 9, textAlign: "left" },
  // The real invoices left-align the figure columns; only the template's
  // blank master right-aligns them, and the filled output is what clients see.
  cellNumeric: { textAlign: "left" },
  cellCenter: { textAlign: "left" },

  /** Full-width "— Monthly Recurring Charges —" divider inside the grid. */
  groupCell: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: (ROW_HEIGHT - 13.2) / 2,
    paddingHorizontal: 4,
    ...border,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },

  // --- rows 32-36: totals ---------------------------------------------------
  totalsBlock: { flexDirection: "row" },
  totalsRow: { flexDirection: "row", minHeight: ROW_HEIGHT },
  /**
   * The template leaves DATE+DESCRIPTION blank alongside the five totals
   * rows. The payment terms live in that gap rather than below the invoice,
   * which is both where the eye already is and the only place they fit
   * without pushing the grid onto a second page.
   */
  totalsSpacer: { width: COL.date + COL.description, paddingRight: 10, justifyContent: "center" },
  totalsLabel: {
    width: COL.hours + COL.rate,
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: 9,
    color: LABEL_BLUE,
    textAlign: "right",
    paddingRight: 8,
    paddingVertical: (ROW_HEIGHT - 10.8) / 2,
  },
  totalsLabelStrong: { fontSize: 10, color: NAVY },
  totalsValue: {
    width: COL.amount,
    fontFamily: HEADING_FONT,
    fontSize: 9,
    textAlign: "right",
    paddingHorizontal: 6,
    paddingVertical: (ROW_HEIGHT - 10.8) / 2,
    ...border,
    borderTopWidth: 0,
  },
  // Tint and emphasis are SEPARATE in the template: SALES TAX is tinted but
  // stays 9pt regular, while SUBTOTAL and TOTAL are tinted AND bold 12pt.
  // Bundling them made SALES TAX shout "N/A" in 12pt bold.
  totalsValueTint: { backgroundColor: AMOUNT_TINT },
  totalsValueStrong: { fontWeight: 700, fontSize: 12 },

  // --- row 37: the URL band (merged A37:E37) --------------------------------
  urlBand: {
    height: px(34),
    backgroundColor: NAVY,
    ...border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: px(10),
  },
  urlText: { fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 14, color: TEAL },

  // --- payment terms, inside the totals block's blank left-hand cell --------
  // Styled to match the block the current template pastes in as an image:
  // centred, labels in navy with the values picked out in the label blue, and
  // the thank-you in bold italic underneath. Rendered as text rather than an
  // image so it stays sharp at any zoom, remains selectable, and keeps
  // reflecting whatever Settings → Organization holds.
  payBlock: {},
  payLine: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontSize: 9.5,
    color: NAVY,
    textAlign: "center",
    marginBottom: 2,
  },
  payValue: { color: LABEL_BLUE },
  thanks: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: 12,
    color: NAVY,
    textAlign: "center",
    marginTop: 8,
  },
});

/**
 * Summary page (work log + prose summary + total due).
 *
 * Its own page, after the invoice grid, so a long invoice that spills across
 * several pages doesn't interleave the narrative with the table.
 */
export const summaryStyles = StyleSheet.create({
  /** Overrides the invoice page's reserved header space. */
  page: { paddingTop: PAGE_TOP + 18, paddingBottom: 24, paddingHorizontal: PAGE_MARGIN, fontFamily: HEADING_FONT, color: NAVY },
  orgName: { fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 18, color: NAVY },
  subLine: { fontFamily: HEADING_FONT, fontSize: 10, color: "#5B6B7C", marginTop: 5 },
  rule: { height: 2, backgroundColor: TEAL, marginTop: 12, marginBottom: 14 },
  sectionTitle: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontSize: 13,
    color: NAVY,
    marginBottom: 9,
  },
  bulletRow: { flexDirection: "row", marginBottom: 4 },
  bullet: { width: 12, fontSize: 9, color: NAVY },
  bulletText: { flex: 1, fontFamily: HEADING_FONT, fontSize: 9, color: NAVY, lineHeight: 1.4 },
  paragraph: {
    fontFamily: HEADING_FONT,
    fontSize: 9,
    color: NAVY,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  totalDue: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontSize: 18,
    color: NAVY,
    textAlign: "right",
    marginTop: 4,
  },
});

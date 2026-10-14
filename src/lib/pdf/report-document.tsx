import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerInvoiceFonts, HEADING_FONT } from "./fonts";
import { NAVY, TEAL, LABEL_BLUE } from "./styles";
import type { ReportsData } from "@/lib/reports/metrics";

/**
 * The Reports page as a PDF.
 *
 * Shares the invoice's fonts and palette so a report handed to an
 * accountant reads as the same company's document, but NOT its geometry --
 * the invoice's layout is a transcription of the master spreadsheet, and
 * bending a report into an 18-row invoice grid would be imitating the wrong
 * thing. This is a plain portrait report: header, summary band, two tables.
 *
 * Rows are wrap={false} so a client's line never splits across a page break,
 * and the table header repeats via `fixed` on continuation pages.
 */

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const usd2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/**
 * Hours, formatted rather than interpolated raw.
 *
 * loadReports already rounds, so this is belt-and-braces -- but binary
 * floating point turns 8.4 + 8.4 + 9.35 into 26.150000000000002, and a report
 * that prints that once has lost the reader's trust in every other number on
 * the page. Trailing zeros are dropped so whole hours stay "5h", not "5.00h".
 */
const hrs = (n: number) => `${Number(n.toFixed(2))}h`;

const COL = { client: 168, invoiced: 78, share: 48, hours: 62, rate: 72, logged: 90 };

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 44,
    paddingHorizontal: 36,
    fontFamily: HEADING_FONT,
    fontSize: 8,
    color: NAVY,
  },
  titleBand: {
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  logo: { height: 30, objectFit: "contain" },
  titleWord: { fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 20, color: TEAL },

  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  metaLabel: {
    fontFamily: HEADING_FONT,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: 9,
    color: LABEL_BLUE,
  },
  metaValue: { fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 9 },

  summary: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: NAVY,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  statLabel: { fontSize: 7, color: LABEL_BLUE, fontWeight: 700, textTransform: "uppercase" },
  statValue: { fontSize: 14, fontWeight: 700, marginTop: 3 },
  statHint: { fontSize: 6.5, color: "#5A6B7D", marginTop: 2 },

  sectionTitle: { fontSize: 11, fontWeight: 700, marginTop: 18, marginBottom: 6 },
  sectionNote: { fontSize: 7, color: "#5A6B7D", marginBottom: 6 },

  tHead: { flexDirection: "row", backgroundColor: TEAL, borderWidth: 1, borderColor: NAVY },
  th: { fontSize: 7.5, fontWeight: 700, paddingVertical: 5, paddingHorizontal: 5 },
  row: {
    flexDirection: "row",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: NAVY,
    minHeight: 16,
  },
  cell: { fontSize: 7.5, paddingVertical: 4.5, paddingHorizontal: 5 },
  totalRow: { backgroundColor: "#BFFDFC" },
  right: { textAlign: "right" },
  muted: { color: "#5A6B7D" },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#5A6B7D",
    borderTopWidth: 1,
    borderTopColor: "#C9D4DE",
    paddingTop: 6,
  },
});

export type ReportPdfData = {
  organizationName: string;
  logoDataUri: string | null;
  rangeLabel: string;
  generatedAt: Date;
  reports: ReportsData;
};

export function ReportPdfDocument({ data }: { data: ReportPdfData }) {
  registerInvoiceFonts();
  const { reports: r } = data;
  const loggedTotal = r.totals.loggedBillable + r.totals.loggedNonBillable;

  return (
    <Document title={`Report — ${data.rangeLabel}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.titleBand} fixed>
          {data.logoDataUri ? (
            /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image takes no alt */
            <Image src={data.logoDataUri} style={styles.logo} />
          ) : (
            <View />
          )}
          <Text style={styles.titleWord}>REPORT</Text>
        </View>

        <View style={styles.meta}>
          <View>
            <Text style={styles.metaLabel}>PERIOD</Text>
            <Text style={styles.metaValue}>{data.rangeLabel}</Text>
          </View>
          <View>
            <Text style={[styles.metaLabel, styles.right]}>GENERATED</Text>
            <Text style={[styles.metaValue, styles.right]}>{formatDate(data.generatedAt)}</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <Stat
            label="Invoiced"
            value={usd(r.totals.invoiced)}
            hint={`${r.totals.invoiceCount} invoice${r.totals.invoiceCount === 1 ? "" : "s"} · ${r.totals.clientsInvoiced} client${r.totals.clientsInvoiced === 1 ? "" : "s"}`}
          />
          <Stat
            label="Effective rate"
            value={r.totals.effectiveRate === null ? "—" : usd2(r.totals.effectiveRate)}
            hint={r.totals.effectiveRate === null ? "Nothing billed" : `across ${hrs(r.totals.billedHours)} billed`}
          />
          <Stat label="Billable logged" value={hrs(r.totals.loggedBillable)} hint="Time entries in period" />
          <Stat
            label="Non-billable"
            value={hrs(r.totals.loggedNonBillable)}
            hint={loggedTotal > 0 ? `${Math.round((r.totals.loggedNonBillable / loggedTotal) * 100)}% of time logged` : "No time logged"}
          />
        </View>

        <Text style={styles.sectionTitle}>By client</Text>
        <Text style={styles.sectionNote}>
          Effective rate is invoiced value divided by the hours on those invoices — not by hours
          logged in the period, which would compare different work.
        </Text>

        {r.clients.length === 0 ? (
          <Text style={[styles.cell, styles.muted]}>
            No invoices raised or time logged in this period.
          </Text>
        ) : (
          <>
            {/* NOT `fixed`. A fixed element repeats on EVERY page of the
                document, not just the pages this table spans -- so on a
                two-page report it reappeared above the service-type table,
                labelling those rows CLIENT / INVOICED / EFF. RATE. Losing the
                repeat on a continuation page is the smaller cost by far. */}
            <View style={styles.tHead}>
              <Text style={[styles.th, { width: COL.client }]}>CLIENT</Text>
              <Text style={[styles.th, styles.right, { width: COL.invoiced }]}>INVOICED</Text>
              <Text style={[styles.th, styles.right, { width: COL.share }]}>SHARE</Text>
              <Text style={[styles.th, styles.right, { width: COL.hours }]}>BILLED HRS</Text>
              <Text style={[styles.th, styles.right, { width: COL.rate }]}>EFF. RATE</Text>
              <Text style={[styles.th, styles.right, { width: COL.logged }]}>LOGGED B/NB</Text>
            </View>
            {r.clients.map((c) => (
              <View key={c.clientId} style={styles.row} wrap={false}>
                <Text style={[styles.cell, { width: COL.client }]}>{c.name}</Text>
                <Text style={[styles.cell, styles.right, { width: COL.invoiced }]}>
                  {usd(c.invoicedAmount)}
                </Text>
                <Text style={[styles.cell, styles.right, styles.muted, { width: COL.share }]}>
                  {c.share > 0 ? `${Math.round(c.share * 100)}%` : "—"}
                </Text>
                <Text style={[styles.cell, styles.right, { width: COL.hours }]}>
                  {c.billedHours > 0 ? hrs(c.billedHours) : "—"}
                </Text>
                <Text style={[styles.cell, styles.right, { width: COL.rate }]}>
                  {c.effectiveRate === null ? "—" : usd2(c.effectiveRate)}
                </Text>
                <Text style={[styles.cell, styles.right, styles.muted, { width: COL.logged }]}>
                  {hrs(c.loggedBillable)} / {hrs(c.loggedNonBillable)}
                </Text>
              </View>
            ))}
            <View style={[styles.row, styles.totalRow]} wrap={false}>
              <Text style={[styles.cell, { width: COL.client, fontWeight: 700 }]}>TOTAL</Text>
              <Text style={[styles.cell, styles.right, { width: COL.invoiced, fontWeight: 700 }]}>
                {usd(r.totals.invoiced)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: COL.share }]}>100%</Text>
              <Text style={[styles.cell, styles.right, { width: COL.hours, fontWeight: 700 }]}>
                {hrs(r.totals.billedHours)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: COL.rate, fontWeight: 700 }]}>
                {r.totals.effectiveRate === null ? "—" : usd2(r.totals.effectiveRate)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: COL.logged }]}>
                {hrs(r.totals.loggedBillable)} / {hrs(r.totals.loggedNonBillable)}
              </Text>
            </View>
          </>
        )}

        {/* wrap={false} keeps the heading with its table: a section title
            stranded alone at the foot of a page reads as a missing table.
            Seven service types is small enough to always fit a page. */}
        <View wrap={false}>
        <Text style={styles.sectionTitle}>By service type</Text>
        {r.serviceTypes.length === 0 ? (
          <Text style={[styles.cell, styles.muted]}>No time logged in this period.</Text>
        ) : (
          <>
            <View style={styles.tHead}>
              <Text style={[styles.th, { width: 60 }]}>CODE</Text>
              <Text style={[styles.th, { width: 220 }]}>SERVICE</Text>
              <Text style={[styles.th, styles.right, { width: 80 }]}>HOURS</Text>
              <Text style={[styles.th, styles.right, { width: 80 }]}>ENTRIES</Text>
              <Text style={[styles.th, styles.right, { width: 78 }]}>SHARE</Text>
            </View>
            {r.serviceTypes.map((t) => (
              <View key={t.code} style={styles.row} wrap={false}>
                <Text style={[styles.cell, { width: 60, fontWeight: 700 }]}>{t.code}</Text>
                <Text style={[styles.cell, { width: 220 }]}>{t.label}</Text>
                <Text style={[styles.cell, styles.right, { width: 80 }]}>{hrs(t.hours)}</Text>
                <Text style={[styles.cell, styles.right, styles.muted, { width: 80 }]}>{t.entries}</Text>
                <Text style={[styles.cell, styles.right, styles.muted, { width: 78 }]}>
                  {Math.round(t.share * 100)}%
                </Text>
              </View>
            ))}
          </>
        )}
        </View>

        {/* Ageing last, and on its own: it is the page an accountant asks
            for, and it answers a different question from everything above --
            what is owed right now, not what happened in the period. */}
        {r.aging.rows.length > 0 && (
          <View break>
            <Text style={styles.sectionTitle}>Money owed, by age</Text>
            <Text style={styles.sectionNote}>
              Counted from the day each invoice was sent. Part-paid invoices count only their
              balance. Not limited to the period above — an unpaid invoice stays unpaid whichever
              month is being reported.
            </Text>
            <View style={styles.tHead}>
              <Text style={[styles.th, { width: 168 }]}>CLIENT</Text>
              <Text style={[styles.th, styles.right, { width: 78 }]}>0–30</Text>
              <Text style={[styles.th, styles.right, { width: 78 }]}>31–60</Text>
              <Text style={[styles.th, styles.right, { width: 78 }]}>61–90</Text>
              <Text style={[styles.th, styles.right, { width: 78 }]}>90+</Text>
              <Text style={[styles.th, styles.right, { width: 78 }]}>TOTAL</Text>
            </View>
            {r.aging.rows.map((row) => (
              <View key={row.clientId} style={styles.row} wrap={false}>
                <Text style={[styles.cell, { width: 168 }]}>{row.name}</Text>
                <Text style={[styles.cell, styles.right, { width: 78 }]}>
                  {row.current ? usd(row.current) : "—"}
                </Text>
                <Text style={[styles.cell, styles.right, { width: 78 }]}>
                  {row.d31_60 ? usd(row.d31_60) : "—"}
                </Text>
                <Text style={[styles.cell, styles.right, { width: 78 }]}>
                  {row.d61_90 ? usd(row.d61_90) : "—"}
                </Text>
                <Text style={[styles.cell, styles.right, { width: 78 }]}>
                  {row.d90plus ? usd(row.d90plus) : "—"}
                </Text>
                <Text style={[styles.cell, styles.right, { width: 78, fontWeight: 700 }]}>
                  {usd(row.total)}
                </Text>
              </View>
            ))}
            <View style={[styles.row, styles.totalRow]} wrap={false}>
              <Text style={[styles.cell, { width: 168, fontWeight: 700 }]}>TOTAL OWED</Text>
              <Text style={[styles.cell, styles.right, { width: 78 }]}>{usd(r.aging.totals.current)}</Text>
              <Text style={[styles.cell, styles.right, { width: 78 }]}>{usd(r.aging.totals.d31_60)}</Text>
              <Text style={[styles.cell, styles.right, { width: 78 }]}>{usd(r.aging.totals.d61_90)}</Text>
              <Text style={[styles.cell, styles.right, { width: 78 }]}>{usd(r.aging.totals.d90plus)}</Text>
              <Text style={[styles.cell, styles.right, { width: 78, fontWeight: 700 }]}>
                {usd(r.aging.totals.total)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{data.organizationName}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

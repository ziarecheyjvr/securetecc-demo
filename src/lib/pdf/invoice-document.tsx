import { Fragment } from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { registerInvoiceFonts } from "./fonts";
import { COL, styles, summaryStyles, TEMPLATE_ROW_COUNT } from "./styles";
import {
  buildServiceSummary,
  buildWorkLog,
  periodLabel,
  shouldPrefixServiceCode,
} from "./summary";
import type { InvoicePdfData, InvoicePdfLineItem } from "./types";

/**
 * Invoice PDF, laid out to match "Invoice Template MASTER" (sheet "Invoice").
 *
 * Structural decisions taken from the sheet rather than invented:
 *  - the INVOICE band and the URL band span the CONTENT columns (A:E), not
 *    the page edge -- they're bordered cells in the sheet, not full bleed;
 *  - labels (DATE / INVOICE # / FOR: / BILL TO:) sit in column C with their
 *    values right-aligned in column E;
 *  - the line-item grid is a fixed 18 rows (14-31) and is padded with empty
 *    bordered rows when the invoice is shorter, which is what gives the
 *    template its consistent shape;
 *  - only SUBTOTAL, SALES TAX and TOTAL carry the pale tint; individual
 *    amount cells do not.
 *
 * Pagination: rows are wrap={false} so one never splits across a page break.
 * When an invoice exceeds 18 rows the grid simply grows and flows onto page
 * 2 -- the fixed count is a minimum, never a cap that would drop billable
 * work off the invoice.
 */
export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  registerInvoiceFonts();

  const { organization: org, client } = data;
  const billerLines = [
    org.billerAddress1,
    org.billerAddress2,
    org.billerCityStateZip,
    org.officePhone ? `Office: ${org.officePhone}` : null,
    org.mobilePhone ? `Mobile: ${org.mobilePhone}` : null,
    org.billerEmail ? `Email: ${org.billerEmail}` : null,
    org.website ? `Website: ${stripScheme(org.website)}` : null,
  ].filter(Boolean) as string[];

  const clientLines = [
    "Attn: Accounting Department",
    client.address1,
    client.address2,
    client.cityStateZip,
    client.phone,
  ].filter(Boolean) as string[];

  // Divider rows occupy grid rows too -- count them so an invoice with a
  // charge group doesn't render one row taller than one without.
  const dividerCount = new Set(
    data.lineItems.map((i) => i.groupLabel).filter((l): l is string => l !== null),
  ).size;
  const padding = Math.max(0, TEMPLATE_ROW_COUNT - data.lineItems.length - dividerCount);

  return (
    <Document title={`Invoice ${data.invoiceNumber}`}>
      <Page size="LETTER" style={styles.page}>
        {/* First in the tree so everything else paints over it. */}
        {org.watermarkDataUri && (
          /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image takes no alt */
          <Image src={org.watermarkDataUri} style={styles.watermark} fixed />
        )}

        <View style={styles.pageHeader} fixed>
          <View style={styles.titleBand}>
          {org.logoDataUri ? (
            /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image takes no alt */
            <Image src={org.logoDataUri} style={styles.logo} />
          ) : (
            <View />
          )}
            <Text style={styles.invoiceWord}>INVOICE</Text>
          </View>

          <View style={[styles.letterhead, styles.letterheadBlock]}>
          <View style={styles.billerBlock}>
            {org.billerName && <Text style={styles.billerName}>{org.billerName}</Text>}
            {billerLines.map((line) => (
              <Text key={line} style={styles.billerLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>DATE</Text>
              <Text style={styles.metaValue}>{formatDate(data.issuedAt)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>INVOICE #</Text>
              <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            </View>

            <View style={styles.metaGap} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>FOR:</Text>
              <Text style={styles.metaValue}>{org.invoiceForLabel}</Text>
            </View>

            <View style={styles.metaGap} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>BILL TO:</Text>
              <Text style={styles.metaValue}>{client.name}</Text>
            </View>
              {clientLines.map((line) => (
                <Text key={line} style={styles.metaValue}>
                  {line}
                </Text>
              ))}
            </View>
          </View>

          <View style={styles.tableHeader} wrap={false}>
            <Text style={[styles.th, { width: COL.date }]}>DATE</Text>
            <Text style={[styles.th, { width: COL.description }]}>DESCRIPTION</Text>
            <Text style={[styles.th, { width: COL.hours }]}>HOURS</Text>
            <Text style={[styles.th, { width: COL.rate }]}>RATE</Text>
            <Text style={[styles.th, styles.thLast, { width: COL.amount }]}>AMOUNT</Text>
          </View>
        </View>

        {data.lineItems.map((item, i) => {
          const previous = i > 0 ? data.lineItems[i - 1].groupLabel : null;
          const opensGroup = item.groupLabel !== null && item.groupLabel !== previous;
          return (
            <Fragment key={i}>
              {opensGroup && <GroupDividerRow label={item.groupLabel!} />}
              <LineRow item={item} />
            </Fragment>
          );
        })}
        {Array.from({ length: padding }, (_, i) => (
          <LineRow key={`pad-${i}`} item={null} />
        ))}

        <View style={styles.totalsBlock} wrap={false}>
          {/* The template leaves this half of the totals rows blank; the
              payment terms occupy it instead of trailing below the invoice. */}
          <View style={[styles.totalsSpacer, styles.payBlock]}>
            {org.checkPayableTo && (
              <Text style={styles.payLine}>
                Make all checks payable to:{" "}
                <Text style={styles.payValue}>{org.checkPayableTo}</Text>
              </Text>
            )}
            {org.acceptedPaymentMethods && (
              <Text style={styles.payLine}>
                We also accept{" "}
                <Text style={styles.payValue}>{org.acceptedPaymentMethods}.</Text>
              </Text>
            )}
            {(org.checkPayableTo || org.acceptedPaymentMethods) && (
              <Text style={styles.thanks}>THANK YOU FOR YOUR BUSINESS</Text>
            )}
          </View>

          <View>
            {/* Tint, value emphasis and label emphasis vary independently across
                these five rows in the template -- see each flag below. */}
            <TotalRow label="SUBTOTAL" value={currency(data.totalAmount)} tinted boldValue />
            <TotalRow label="TAX RATE" value="N/A" />
            <TotalRow label="SALES TAX" value="N/A" tinted />
            <TotalRow label="OTHER" value="—" />
            <TotalRow label="TOTAL" value={currency(data.totalAmount)} tinted boldValue strongLabel />
          </View>
        </View>

        {org.website && (
          <View style={styles.urlBand} wrap={false}>
            <Text style={styles.urlText}>{org.website}</Text>
          </View>
        )}

      </Page>

      <SummaryPage data={data} />
    </Document>
  );
}

/**
 * Work log + prose summary + total due, on its own page.
 *
 * Separate page rather than appended below the grid: a long invoice already
 * spills across several pages, and interleaving the narrative with the table
 * would put it somewhere unpredictable. This way it's always the last page.
 */
function SummaryPage({ data }: { data: InvoicePdfData }) {
  const period = periodLabel(data.periodStart, data.periodEnd);
  const workLog = buildWorkLog(data.lineItems);
  const paragraphs = buildServiceSummary({
    clientName: data.client.name,
    orgName: data.organization.name,
    periodLabel: period,
  });

  return (
    <Page size="LETTER" style={summaryStyles.page}>
      <Text style={summaryStyles.orgName}>{data.organization.name}</Text>
      <Text style={summaryStyles.subLine}>
        Invoice #{data.invoiceNumber}  |  {data.client.name}  |  {period}
      </Text>
      <Text style={summaryStyles.subLine}>Date: {formatDate(data.issuedAt)}</Text>

      <View style={summaryStyles.rule} />
      <Text style={summaryStyles.sectionTitle}>DETAILED WORK LOG</Text>
      {workLog.map((entry, i) => (
        <View key={i} style={summaryStyles.bulletRow} wrap={false}>
          <Text style={summaryStyles.bullet}>•</Text>
          <Text style={summaryStyles.bulletText}>
            {entry.when}
            {entry.code ? ` — ${entry.code}` : ""} — {entry.description}
          </Text>
        </View>
      ))}

      <View style={summaryStyles.rule} />
      <Text style={summaryStyles.sectionTitle}>SERVICE SUMMARY</Text>
      {paragraphs.map((p, i) => (
        <Text key={i} style={summaryStyles.paragraph}>
          {p}
        </Text>
      ))}

      <View style={summaryStyles.rule} />
      <Text style={summaryStyles.totalDue}>Total Due: {currency(data.totalAmount)}</Text>

    </Page>
  );
}

function LineRow({ item }: { item: InvoicePdfLineItem | null }) {
  // The invoice prefixes each description with its service-type code -- unless
  // the description already carries one (see shouldPrefixServiceCode).
  const description = item
    ? item.serviceCode && shouldPrefixServiceCode(item.description)
      ? `${item.serviceCode} — ${item.description}`
      : item.description
    : " ";

  return (
    <View style={styles.row} wrap={false}>
      <Text style={[styles.cell, styles.cellCenter, { width: COL.date }]}>
        {item?.date ? formatDate(item.date) : " "}
      </Text>
      <Text style={[styles.cell, { width: COL.description }]}>{description}</Text>
      <Text style={[styles.cell, styles.cellNumeric, { width: COL.hours }]}>
        {item?.hours != null ? item.hours.toFixed(2) : " "}
      </Text>
      <Text style={[styles.cell, styles.cellNumeric, { width: COL.rate }]}>
        {item?.noCharge ? "No charge" : item?.rate != null ? currency(item.rate) : " "}
      </Text>
      <Text style={[styles.cell, styles.cellLast, styles.cellAmount, { width: COL.amount }]}>
        {/* Blank, not $0.00. The empty rows exist to hold the grid's shape --
            printing an amount on them states a charge that does not exist,
            and a client reading four "$0.00" lines reasonably wonders what
            they were for. */}
        {item?.amount != null ? currency(item.amount) : " "}
      </Text>
    </View>
  );
}

/** Full-width heading row that opens a charge group inside the grid. */
function GroupDividerRow({ label }: { label: string }) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={[styles.groupCell, { width: COL.date + COL.description + COL.hours + COL.rate }]}>
        — {label} —
      </Text>
      <Text style={[styles.cell, styles.cellLast, styles.cellAmount, { width: COL.amount }]}>
        {/* A divider carries no amount -- it labels the rows beneath it. */}
        {" "}
      </Text>
    </View>
  );
}

function TotalRow({
  label,
  value,
  tinted,
  boldValue,
  strongLabel,
}: {
  label: string;
  value: string;
  /** Pale-teal cell background (SUBTOTAL, SALES TAX, TOTAL). */
  tinted?: boolean;
  /** 12pt bold figure (SUBTOTAL, TOTAL). */
  boldValue?: boolean;
  /** 10pt navy label instead of 9pt blue (TOTAL only). */
  strongLabel?: boolean;
}) {
  return (
    <View style={styles.totalsRow} wrap={false}>
      <Text style={[styles.totalsLabel, ...(strongLabel ? [styles.totalsLabelStrong] : [])]}>
        {label}
      </Text>
      <Text
        style={[
          styles.totalsValue,
          ...(tinted ? [styles.totalsValueTint] : []),
          ...(boldValue ? [styles.totalsValueStrong] : []),
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function currency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}


/** 7/13/2026 -- the existing invoices don't zero-pad. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

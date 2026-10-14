import { requireAdminContext } from "@/lib/auth";
import { resolveRange } from "@/lib/dashboard/metrics";
import { loadReports } from "@/lib/reports/metrics";
import { fetchLogoDataUri } from "@/lib/pdf/logo";
import { generateReportPdf } from "@/lib/pdf/generate-report-pdf";

/**
 * Renders the current report to a PDF and returns it as a download.
 *
 * A route handler rather than a server action so the button can be a plain
 * <a href>, which gives open-in-new-tab and save-as for free -- the same
 * reason the invoice PDF route is one.
 *
 * Rendered on demand rather than stored: unlike an invoice, a report is a
 * view of live data with no archival identity, so there is nothing to keep in
 * a bucket and nothing that could go stale against the page it came from.
 *
 * The range comes from the same query params the page uses, so whatever is on
 * screen is what downloads -- and the URL stays shareable.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const range = resolveRange(
    params.get("range") ?? undefined,
    params.get("from") ?? undefined,
    params.get("to") ?? undefined,
  );

  const { appUser, data } = await requireAdminContext((tx) => loadReports(tx, range));

  const pdf = await generateReportPdf({
    organizationName: appUser.organization.name,
    logoDataUri: await fetchLogoDataUri(appUser.organization.logoUrl),
    rangeLabel: range.label,
    generatedAt: new Date(),
    reports: data!,
  });
  // Slugged from the range so several downloads don't all land in Downloads
  // as report.pdf, report(1).pdf, report(2).pdf.
  const slug = range.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const filename = `securetecc-report-${slug}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A report reflects live data; a cached copy would silently show
      // yesterday's numbers behind today's URL.
      "Cache-Control": "no-store",
    },
  });
}

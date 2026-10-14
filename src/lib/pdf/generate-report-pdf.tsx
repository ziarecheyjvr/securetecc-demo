import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { ReportPdfDocument, type ReportPdfData } from "./report-document";

/**
 * Renders the reports page to a PDF buffer.
 *
 * Mirrors generate-invoice-pdf: the JSX form matters, because react-pdf calls
 * the component during its own render pass, which is when the document's
 * Font.register call has to have run. Calling the component as a plain
 * function and handing the result to renderToBuffer registers the fonts too
 * late and the render falls over with "Font family not registered".
 */
export async function generateReportPdf(data: ReportPdfData): Promise<Buffer> {
  const element = (<ReportPdfDocument data={data} />) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

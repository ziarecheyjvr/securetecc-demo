import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { InvoicePdfDocument } from "./invoice-document";
import type { InvoicePdfData } from "./types";

/**
 * Renders an invoice to a PDF buffer.
 *
 * Called AFTER the generation transaction commits -- rendering is slow enough
 * that holding a DB transaction open across it is a bad trade, and the invoice
 * rows are already correct by then (see app/(app)/invoices/actions.ts).
 *
 * The cast is needed because renderToBuffer is typed to take the root
 * <Document> element itself; TypeScript can't see that InvoicePdfDocument
 * returns one through the component boundary.
 */
export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const element = (<InvoicePdfDocument data={data} />) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

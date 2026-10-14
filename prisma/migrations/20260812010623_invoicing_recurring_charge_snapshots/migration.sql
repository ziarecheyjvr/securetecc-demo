-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "lastInvoiceSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "recurring_charges" ADD COLUMN     "activeStatus" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "invoice_recurring_charges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "recurringChargeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "billingFrequency" "BillingFrequency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_recurring_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_recurring_charges_organizationId_idx" ON "invoice_recurring_charges"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_recurring_charges_invoiceId_idx" ON "invoice_recurring_charges"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_recurring_charges_recurringChargeId_idx" ON "invoice_recurring_charges"("recurringChargeId");

-- AddForeignKey
ALTER TABLE "invoice_recurring_charges" ADD CONSTRAINT "invoice_recurring_charges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_recurring_charges" ADD CONSTRAINT "invoice_recurring_charges_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_recurring_charges" ADD CONSTRAINT "invoice_recurring_charges_recurringChargeId_fkey" FOREIGN KEY ("recurringChargeId") REFERENCES "recurring_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

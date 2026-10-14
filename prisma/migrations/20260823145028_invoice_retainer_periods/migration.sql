-- CreateTable
CREATE TABLE "invoice_retainer_periods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_retainer_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_retainer_periods_organizationId_idx" ON "invoice_retainer_periods"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_retainer_periods_clientId_idx" ON "invoice_retainer_periods"("clientId");

-- CreateIndex
CREATE INDEX "invoice_retainer_periods_invoiceId_idx" ON "invoice_retainer_periods"("invoiceId");

-- AddForeignKey
ALTER TABLE "invoice_retainer_periods" ADD CONSTRAINT "invoice_retainer_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_retainer_periods" ADD CONSTRAINT "invoice_retainer_periods_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_retainer_periods" ADD CONSTRAINT "invoice_retainer_periods_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

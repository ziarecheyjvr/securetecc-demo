-- CreateTable
CREATE TABLE "invoice_custom_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "date" DATE,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(7,2),
    "rate" DECIMAL(10,2),
    "amount" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_custom_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_custom_items_invoiceId_idx" ON "invoice_custom_items"("invoiceId");

-- AddForeignKey
ALTER TABLE "invoice_custom_items" ADD CONSTRAINT "invoice_custom_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;


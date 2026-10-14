-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'Invoiced';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "issuedAt" TIMESTAMP(3);

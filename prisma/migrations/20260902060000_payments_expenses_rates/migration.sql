-- CreateEnum
CREATE TYPE "ServiceArea" AS ENUM ('InArea', 'OutOfArea');

-- CreateEnum
CREATE TYPE "ExpenseFrequency" AS ENUM ('Monthly', 'Annual', 'OneOff');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AddonItemType" ADD VALUE 'SiteFee';
ALTER TYPE "AddonItemType" ADD VALUE 'RMM';
ALTER TYPE "AddonItemType" ADD VALUE 'EmailSecurity';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "scheduledRate" DECIMAL(10,2),
ADD COLUMN     "scheduledRateFrom" DATE,
ADD COLUMN     "serviceArea" "ServiceArea" NOT NULL DEFAULT 'InArea';

-- AlterTable
ALTER TABLE "recurring_charges" ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "startDate" DATE,
ADD COLUMN     "unitPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "rateOverride" DECIMAL(10,2),
ADD COLUMN     "travelMinutes" INTEGER;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "receivedAt" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "methodOther" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_expenses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "category" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "frequency" "ExpenseFrequency" NOT NULL DEFAULT 'Monthly',
    "clientId" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "activeStatus" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_organizationId_idx" ON "payments"("organizationId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "business_expenses_organizationId_idx" ON "business_expenses"("organizationId");

-- CreateIndex
CREATE INDEX "business_expenses_clientId_idx" ON "business_expenses"("clientId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;


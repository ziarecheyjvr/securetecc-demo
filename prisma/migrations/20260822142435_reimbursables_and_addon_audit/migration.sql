-- CreateEnum
CREATE TYPE "AddonItemType" AS ENUM ('DMARC', 'MonitoringSeat', 'RemoteMonitoring', 'Other');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('Manual', 'Voice', 'CsvImport');

-- AlterTable
ALTER TABLE "recurring_charges" ADD COLUMN     "authorizedBy" TEXT,
ADD COLUMN     "itemType" "AddonItemType";

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "source" "TimeEntrySource" NOT NULL DEFAULT 'Manual';

-- CreateTable
CREATE TABLE "reimbursable_expenses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "invoiceId" TEXT,
    "loggedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reimbursable_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_charge_audit_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recurringChargeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "itemType" "AddonItemType",
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "billingFrequency" "BillingFrequency" NOT NULL,
    "authorizedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_charge_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_pricing" (
    "organizationId" TEXT NOT NULL,
    "itemType" "AddonItemType" NOT NULL,
    "defaultRate" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "addon_pricing_pkey" PRIMARY KEY ("organizationId","itemType")
);

-- CreateIndex
CREATE INDEX "reimbursable_expenses_organizationId_idx" ON "reimbursable_expenses"("organizationId");

-- CreateIndex
CREATE INDEX "reimbursable_expenses_clientId_idx" ON "reimbursable_expenses"("clientId");

-- CreateIndex
CREATE INDEX "reimbursable_expenses_invoiceId_idx" ON "reimbursable_expenses"("invoiceId");

-- CreateIndex
CREATE INDEX "recurring_charge_audit_log_organizationId_idx" ON "recurring_charge_audit_log"("organizationId");

-- CreateIndex
CREATE INDEX "recurring_charge_audit_log_recurringChargeId_idx" ON "recurring_charge_audit_log"("recurringChargeId");

-- AddForeignKey
ALTER TABLE "reimbursable_expenses" ADD CONSTRAINT "reimbursable_expenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursable_expenses" ADD CONSTRAINT "reimbursable_expenses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursable_expenses" ADD CONSTRAINT "reimbursable_expenses_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursable_expenses" ADD CONSTRAINT "reimbursable_expenses_loggedByUserId_fkey" FOREIGN KEY ("loggedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_charge_audit_log" ADD CONSTRAINT "recurring_charge_audit_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_charge_audit_log" ADD CONSTRAINT "recurring_charge_audit_log_recurringChargeId_fkey" FOREIGN KEY ("recurringChargeId") REFERENCES "recurring_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_pricing" ADD CONSTRAINT "addon_pricing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

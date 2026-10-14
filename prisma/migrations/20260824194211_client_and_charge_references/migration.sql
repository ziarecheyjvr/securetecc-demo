-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "recurring_charges" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clients_organizationId_reference_key" ON "clients"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_charges_organizationId_reference_key" ON "recurring_charges"("organizationId", "reference");


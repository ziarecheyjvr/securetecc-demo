-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'technician');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('Hourly', 'Retainer');

-- CreateEnum
CREATE TYPE "BillableStatus" AS ENUM ('Billable', 'NonBillable', 'Residual');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('Monthly', 'Annual');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('Draft', 'Sent', 'Paid');

-- CreateEnum
CREATE TYPE "TicketUrgency" AS ENUM ('Critical', 'High', 'Medium', 'Low');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('New', 'InProgress', 'Resolved', 'Closed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "brandColorPrimary" TEXT NOT NULL DEFAULT '#071E37',
    "brandColorAccent" TEXT NOT NULL DEFAULT '#06E1DC',
    "supportEmail" TEXT NOT NULL,
    "invoiceFromEmail" TEXT,
    "phone" TEXT,
    "emailDomainVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'technician',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "cityStateZip" TEXT,
    "billingType" "BillingType" NOT NULL DEFAULT 'Hourly',
    "billingRate" DECIMAL(10,2),
    "activeStatus" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "billingMinimumHours" DECIMAL(5,2) NOT NULL,
    "rateOverride" DECIMAL(10,2),

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "durationHours" DECIMAL(5,2) NOT NULL,
    "description" TEXT NOT NULL,
    "billableStatus" "BillableStatus" NOT NULL DEFAULT 'Billable',
    "serviceTypeId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "loggedByUserId" TEXT NOT NULL,
    "rawInput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_charges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "billingFrequency" "BillingFrequency" NOT NULL DEFAULT 'Monthly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalHours" DECIMAL(7,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'Draft',
    "pdfUrl" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "clientCompanyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "urgency" "TicketUrgency" NOT NULL DEFAULT 'Medium',
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'New',
    "assignedToUserId" TEXT,
    "internalNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_supportEmail_key" ON "organizations"("supportEmail");

-- CreateIndex
CREATE UNIQUE INDEX "users_authUserId_key" ON "users"("authUserId");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_email_key" ON "users"("organizationId", "email");

-- CreateIndex
CREATE INDEX "clients_organizationId_idx" ON "clients"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organizationId_shortName_key" ON "clients"("organizationId", "shortName");

-- CreateIndex
CREATE INDEX "service_types_organizationId_idx" ON "service_types"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_organizationId_code_key" ON "service_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "time_entries_organizationId_idx" ON "time_entries"("organizationId");

-- CreateIndex
CREATE INDEX "time_entries_clientId_idx" ON "time_entries"("clientId");

-- CreateIndex
CREATE INDEX "time_entries_invoiceId_idx" ON "time_entries"("invoiceId");

-- CreateIndex
CREATE INDEX "recurring_charges_organizationId_idx" ON "recurring_charges"("organizationId");

-- CreateIndex
CREATE INDEX "recurring_charges_clientId_idx" ON "recurring_charges"("clientId");

-- CreateIndex
CREATE INDEX "invoices_organizationId_idx" ON "invoices"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_clientId_idx" ON "invoices"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_clientId_invoiceNumber_key" ON "invoices"("organizationId", "clientId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "tickets_organizationId_idx" ON "tickets"("organizationId");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_organizationId_ticketNumber_key" ON "tickets"("organizationId", "ticketNumber");

-- CreateIndex
CREATE INDEX "ticket_attachments_ticketId_idx" ON "ticket_attachments"("ticketId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_loggedByUserId_fkey" FOREIGN KEY ("loggedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_charges" ADD CONSTRAINT "recurring_charges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_charges" ADD CONSTRAINT "recurring_charges_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

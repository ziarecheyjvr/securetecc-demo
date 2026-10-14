-- CreateEnum
CREATE TYPE "BillingCadence" AS ENUM ('Monthly', 'Quarterly');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'Card';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "billingCadence" "BillingCadence" NOT NULL DEFAULT 'Monthly';

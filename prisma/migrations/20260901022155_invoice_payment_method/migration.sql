-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('Check', 'Cash', 'ACH', 'Zelle', 'PayPal', 'Venmo', 'Other');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "paymentMethod" "PaymentMethod";

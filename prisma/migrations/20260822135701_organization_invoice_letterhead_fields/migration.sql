-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "acceptedPaymentMethods" TEXT,
ADD COLUMN     "billerAddress1" TEXT,
ADD COLUMN     "billerAddress2" TEXT,
ADD COLUMN     "billerCityStateZip" TEXT,
ADD COLUMN     "billerEmail" TEXT,
ADD COLUMN     "billerMobilePhone" TEXT,
ADD COLUMN     "billerName" TEXT,
ADD COLUMN     "checkPayableTo" TEXT,
ADD COLUMN     "invoiceForLabel" TEXT,
ADD COLUMN     "website" TEXT;

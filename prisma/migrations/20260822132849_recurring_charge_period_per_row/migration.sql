/*
  Warnings:

  - Added the required column `periodEnd` to the `invoice_recurring_charges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `periodStart` to the `invoice_recurring_charges` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "invoice_recurring_charges" ADD COLUMN     "periodEnd" DATE NOT NULL,
ADD COLUMN     "periodStart" DATE NOT NULL;

-- CreateEnum
CREATE TYPE "AvailabilityExceptionKind" AS ENUM ('Leave', 'Unavailable', 'DifferentHours', 'Blocked');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "project" TEXT;

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" "AvailabilityExceptionKind" NOT NULL,
    "startMinutes" INTEGER,
    "endMinutes" INTEGER,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_exceptions_userId_date_idx" ON "availability_exceptions"("userId", "date");

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('Work', 'Commitment');

-- AlterTable
ALTER TABLE "user_availability" ADD COLUMN     "kind" "AvailabilityKind" NOT NULL DEFAULT 'Work';


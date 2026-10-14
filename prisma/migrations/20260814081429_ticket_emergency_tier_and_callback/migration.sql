-- AlterEnum
ALTER TYPE "TicketUrgency" ADD VALUE 'Emergency';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "callbackNumber" TEXT;

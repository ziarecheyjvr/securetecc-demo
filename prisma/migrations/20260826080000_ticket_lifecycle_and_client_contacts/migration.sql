-- Ticket lifecycle + client contact split.
--
-- Written by hand rather than generated, because Prisma models both of these
-- as drop-and-recreate. RENAME preserves the data: an auto-generated version
-- would have dropped every client's contact name and every ticket's Resolved
-- state and put back empty columns.

-- Resolved -> Completed. A rename, so existing rows keep their state.
ALTER TYPE "TicketStatus" RENAME VALUE 'Resolved' TO 'Completed';

-- Blocked-on-the-client, positioned between InProgress and Completed so the
-- enum's own order matches the lifecycle.
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'WaitingOnClient' BEFORE 'Completed';

-- contactName was doing two jobs. Whoever owns the business is rarely whoever
-- pays the bill, and the list needs to show the latter.
ALTER TABLE "clients" RENAME COLUMN "contactName" TO "ownerName";
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "billingContactName" TEXT;

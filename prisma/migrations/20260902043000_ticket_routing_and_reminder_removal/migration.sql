-- Where ticket traffic is watched, separately from the public support address.
ALTER TABLE "organizations" ADD COLUMN "ticketNotificationEmail" TEXT;

-- The 7pm "you haven't logged time today" email is gone: the reminder now
-- lives on the dashboard, where it can be acted on. The opt-in flag it read
-- goes with it. Nothing else referenced the column.
ALTER TABLE "users" DROP COLUMN "receivesDailyReminder",
ADD COLUMN "receivesTicketEmails" BOOLEAN NOT NULL DEFAULT true;

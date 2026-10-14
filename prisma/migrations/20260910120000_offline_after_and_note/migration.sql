-- Two facts about availability that are not working hours.
--
-- offlineAfterMinutes is when someone stops being reachable, in their own
-- zone. Across a 15-hour gap "will this wake them" is not a question the
-- sender can answer in their head, so the page answers it for them. It is
-- never counted as a working hour.
ALTER TABLE "users"
  ADD COLUMN "offlineAfterMinutes" INTEGER,
  ADD COLUMN "availabilityNote" TEXT;

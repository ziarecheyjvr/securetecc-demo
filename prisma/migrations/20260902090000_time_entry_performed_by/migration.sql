-- Who actually did the work, which is not always who logged it.

-- performedByUserId is NOT NULL, so it arrives nullable, is backfilled from
-- loggedByUserId, and is then constrained.
ALTER TABLE "time_entries" ADD COLUMN "performedByUserId" TEXT;
UPDATE "time_entries" SET "performedByUserId" = "loggedByUserId" WHERE "performedByUserId" IS NULL;
ALTER TABLE "time_entries" ALTER COLUMN "performedByUserId" SET NOT NULL;

ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_performedByUserId_fkey"
  FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "time_entries_performedByUserId_idx" ON "time_entries"("performedByUserId");

-- Where each person works from, and when.
--
-- The zone is per person because the hours are stored in that person's own
-- wall-clock time: "9 to 6 Manila" is a fact about their clock, and rendering
-- it in Pacific is a question asked at read time -- one whose answer changes
-- twice a year, since Pacific observes daylight saving and Manila does not.
ALTER TABLE "users"
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  ADD COLUMN "jobTitle" TEXT;

CREATE TABLE "user_availability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_availability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_availability_userId_idx" ON "user_availability"("userId");

ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

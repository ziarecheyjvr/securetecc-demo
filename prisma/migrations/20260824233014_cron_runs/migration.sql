-- CreateTable
CREATE TABLE "cron_runs" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cron_runs_jobName_periodKey_key" ON "cron_runs"("jobName", "periodKey");


-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("key","windowStart")
);

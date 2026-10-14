-- CreateTable
CREATE TABLE "email_signatures" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_signatures_organizationId_idx" ON "email_signatures"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "email_signatures_ownerUserId_name_key" ON "email_signatures"("ownerUserId", "name");

-- AddForeignKey
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

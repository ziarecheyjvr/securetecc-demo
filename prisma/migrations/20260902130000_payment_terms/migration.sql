-- How long a client has to pay. Net 30 by default; the ageing report reads it
-- rather than assuming, so changing terms changes what counts as overdue.
ALTER TABLE "organizations" ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 30;

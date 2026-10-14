-- The operations sheet numbers each reimbursable ("RB-925653fa"). Keeping it
-- lets imported rows be reconciled against the sheet by eye, and makes an
-- import exactly reversible -- the same job Client.reference and
-- Invoice.importedFrom already do.
ALTER TABLE "reimbursable_expenses" ADD COLUMN IF NOT EXISTS "reference" TEXT;

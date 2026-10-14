-- The dashboard's monthly invoicing target defaults to $10,000.
ALTER TABLE "organizations" ALTER COLUMN "monthlyRevenueGoal" SET DEFAULT 10000;
UPDATE "organizations" SET "monthlyRevenueGoal" = 10000 WHERE "monthlyRevenueGoal" = 20000;

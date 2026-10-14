-- A service type can carry a rate agreed for later, the same way a client
-- already can. The January card splits by SERVICE (remote $125, on-site
-- $150), which the client-level scheduled rate cannot express on its own --
-- and setting the on-site override today would charge $150 for the rest of
-- this year.
ALTER TABLE "service_types"
  ADD COLUMN "scheduledRate" DECIMAL(10,2),
  ADD COLUMN "scheduledRateFrom" DATE;

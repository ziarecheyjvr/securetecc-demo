-- "How did you hear about us?" is a question for a NEW client. The clients who
-- were already here need an answer of their own -- otherwise every one of them
-- sits in the report's "no attribution recorded" list forever, which reads as
-- a gap to fill rather than a question that does not apply.
ALTER TYPE "LeadSource" ADD VALUE 'Legacy';

-- What a recurring service costs to deliver, so the margin on it is visible
-- rather than assumed.
ALTER TABLE "recurring_charges" ADD COLUMN "cost" DECIMAL(10,2);

-- Per-person notification preferences. All on by default: someone handed a
-- task should hear about it unless they say otherwise. Off is a real choice,
-- not a failure -- the task is still on the board either way.
ALTER TABLE "users"
  ADD COLUMN "notifyTaskAssigned" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyTaskForReview" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyTaskCompleted" BOOLEAN NOT NULL DEFAULT true;

-- A task can be assigned to more than one person -- work involving both Zia
-- and Ian is one task with two owners, not two tasks that drift apart.
--
-- The primary assignee stays on the task row (it is what the board files the
-- card under, and what every existing query reads) and is ALSO a row here, so
-- "is this person on this task" is one membership lookup.
CREATE TABLE "task_assignees" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("taskId","userId")
);

CREATE INDEX "task_assignees_userId_idx" ON "task_assignees"("userId");

ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing task keeps exactly the assignee it already had.
INSERT INTO "task_assignees" ("taskId", "userId", "notifiedAt")
SELECT "id", "assignedToUserId", "createdAt" FROM "tasks";

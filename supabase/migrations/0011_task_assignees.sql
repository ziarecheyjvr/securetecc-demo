-- Task assignees.
--
-- Same shape as tasks themselves: everyone in the org reads every row --
-- shared visibility is the point of the board -- and only the delegator
-- writes. The assignee-can-update-status rule on `tasks` now has to consider
-- everyone assigned, not just the primary, or a second assignee could see a
-- task and not move it.

alter table public.task_assignees enable row level security;

drop policy if exists "task_assignees: staff read within org" on public.task_assignees;
create policy "task_assignees: staff read within org"
  on public.task_assignees for select
  to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = "taskId" and t."organizationId" = public.current_org_id()
    )
  );

drop policy if exists "task_assignees: delegator writes" on public.task_assignees;
create policy "task_assignees: delegator writes"
  on public.task_assignees for all
  to authenticated
  using (
    public.can_delegate_tasks()
    and exists (
      select 1 from public.tasks t
      where t.id = "taskId" and t."organizationId" = public.current_org_id()
    )
  )
  with check (
    public.can_delegate_tasks()
    and exists (
      select 1 from public.tasks t
      where t.id = "taskId" and t."organizationId" = public.current_org_id()
    )
  );

-- Anyone assigned may move their own task, not only the primary assignee.
-- The single-assignee policy from 0007 is replaced rather than left beside
-- this one: two permissive policies for the same operation is a rule nobody
-- can read off the schema.
drop policy if exists "tasks: delegator or assignee updates" on public.tasks;
drop policy if exists "tasks: assignee or delegator can update" on public.tasks;
create policy "tasks: assignee or delegator can update"
  on public.tasks for update
  to authenticated
  using (
    "organizationId" = public.current_org_id()
    and (
      public.can_delegate_tasks()
      or "assignedToUserId" = public.current_app_user_id()
      or exists (
        select 1 from public.task_assignees a
        where a."taskId" = id and a."userId" = public.current_app_user_id()
      )
    )
  )
  with check (
    "organizationId" = public.current_org_id()
    and (
      public.can_delegate_tasks()
      or "assignedToUserId" = public.current_app_user_id()
      or exists (
        select 1 from public.task_assignees a
        where a."taskId" = id and a."userId" = public.current_app_user_id()
      )
    )
  );

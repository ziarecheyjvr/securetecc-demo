-- Task delegation.
--
-- The access shape here is deliberately asymmetric, and it is the whole point
-- of the feature: everyone READS everything, but only the delegator WRITES.
-- Shared visibility is what makes it a coordination tool rather than four
-- private to-do lists; restricted creation is what keeps it a delegation
-- record rather than a free-for-all.

alter table public.tasks enable row level security;

-- Who may delegate. A per-user flag rather than a role test: role='admin' is
-- held by more than one person in this org, and delegation is specifically
-- the business owner's function.
create or replace function public.can_delegate_tasks()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select "canDelegateTasks" from public.users where "authUserId" = auth.uid()::text limit 1),
    false
  );
$$;

-- The caller's own users.id, for comparing against a task's assignee without
-- exposing the users table to a subquery inside every policy.
create or replace function public.current_app_user_id()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select id from public.users where "authUserId" = auth.uid()::text limit 1;
$$;

-- READ: every staff member sees every task in their org.
drop policy if exists "tasks: staff read within org" on public.tasks;
create policy "tasks: staff read within org"
  on public.tasks for select
  to authenticated
  using ("organizationId" = public.current_org_id());

-- CREATE: only a delegator, and only recording themselves as the creator --
-- otherwise the audit value of "who assigned this" evaporates.
drop policy if exists "tasks: delegator creates" on public.tasks;
create policy "tasks: delegator creates"
  on public.tasks for insert
  to authenticated
  with check (
    "organizationId" = public.current_org_id()
    and public.can_delegate_tasks()
    and "createdByUserId" = public.current_app_user_id()
  );

-- UPDATE: the delegator may change anything; the assignee may update their own
-- task (in practice, its status -- the column-level restriction is enforced in
-- the server action, since Postgres policies gate rows, not fields).
drop policy if exists "tasks: delegator or assignee updates" on public.tasks;
create policy "tasks: delegator or assignee updates"
  on public.tasks for update
  to authenticated
  using (
    "organizationId" = public.current_org_id()
    and (public.can_delegate_tasks() or "assignedToUserId" = public.current_app_user_id())
  )
  with check (
    "organizationId" = public.current_org_id()
    and (public.can_delegate_tasks() or "assignedToUserId" = public.current_app_user_id())
  );

-- DELETE: delegator only. An assignee closing a task they don't want is not a
-- deletion; it's a status change, which the policy above already allows.
drop policy if exists "tasks: delegator deletes" on public.tasks;
create policy "tasks: delegator deletes"
  on public.tasks for delete
  to authenticated
  using ("organizationId" = public.current_org_id() and public.can_delegate_tasks());

grant select, insert, update, delete on public.tasks to authenticated;

-- One-off changes to someone's usual hours (leave, blocked time, changed
-- hours). Same rules as the weekly hours: everyone in the org reads them,
-- and you write your own or, as an admin, anyone's.

alter table public.availability_exceptions enable row level security;

drop policy if exists "availability_exceptions: staff read within org" on public.availability_exceptions;
create policy "availability_exceptions: staff read within org"
  on public.availability_exceptions for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = "userId" and u."organizationId" = public.current_org_id()
    )
  );

drop policy if exists "availability_exceptions: own or admin writes" on public.availability_exceptions;
create policy "availability_exceptions: own or admin writes"
  on public.availability_exceptions for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = "userId"
        and u."organizationId" = public.current_org_id()
        and (u.id = public.current_app_user_id() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = "userId"
        and u."organizationId" = public.current_org_id()
        and (u.id = public.current_app_user_id() or public.is_admin())
    )
  );

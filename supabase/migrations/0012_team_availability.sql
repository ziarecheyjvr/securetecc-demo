-- Team availability.
--
-- Everyone in the org reads everyone's hours -- that is the entire point of
-- the page, and a rota nobody else can see is a diary. Writing is your own
-- row, or anyone's if you are an admin, which mirrors how the notification
-- preferences already work.

alter table public.user_availability enable row level security;

drop policy if exists "user_availability: staff read within org" on public.user_availability;
create policy "user_availability: staff read within org"
  on public.user_availability for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = "userId" and u."organizationId" = public.current_org_id()
    )
  );

drop policy if exists "user_availability: own or admin writes" on public.user_availability;
create policy "user_availability: own or admin writes"
  on public.user_availability for all
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

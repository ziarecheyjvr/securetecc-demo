-- Saved HTML email signatures.
--
-- Personal, not shared: a signature carries someone's name, title and mobile
-- number, so the row's owner is the only one who reads or writes it. That is
-- narrower than the usual "staff within org" shape used elsewhere here, and
-- deliberately so -- there is no case for picking a colleague's signature.

alter table public.email_signatures enable row level security;

drop policy if exists "email_signatures: owner reads own" on public.email_signatures;
create policy "email_signatures: owner reads own"
  on public.email_signatures for select
  to authenticated
  using (
    "organizationId" = public.current_org_id()
    and "ownerUserId" = public.current_app_user_id()
  );

drop policy if exists "email_signatures: owner writes own" on public.email_signatures;
create policy "email_signatures: owner writes own"
  on public.email_signatures for insert
  to authenticated
  with check (
    "organizationId" = public.current_org_id()
    and "ownerUserId" = public.current_app_user_id()
  );

drop policy if exists "email_signatures: owner updates own" on public.email_signatures;
create policy "email_signatures: owner updates own"
  on public.email_signatures for update
  to authenticated
  using (
    "organizationId" = public.current_org_id()
    and "ownerUserId" = public.current_app_user_id()
  )
  with check (
    "organizationId" = public.current_org_id()
    and "ownerUserId" = public.current_app_user_id()
  );

drop policy if exists "email_signatures: owner deletes own" on public.email_signatures;
create policy "email_signatures: owner deletes own"
  on public.email_signatures for delete
  to authenticated
  using (
    "organizationId" = public.current_org_id()
    and "ownerUserId" = public.current_app_user_id()
  );

-- Profile: avatar and birthday.
--
-- Birthday is two integers rather than a date. Only month/day are ever used,
-- and a date-only column read in the wrong timezone is precisely what shifted
-- the daily-reminder window and every imported time entry by a day. Integers
-- have no timezone to get wrong.
alter table public.users
  add column if not exists "avatarPath" text,
  add column if not exists "birthMonth" integer,
  add column if not exists "birthDay" integer;

-- Reject impossible dates at the database, not only in the form: a birthday
-- arriving through any other path still has to be a real one. Day is bounded
-- at 31 rather than per-month -- Feb 30 is worth rejecting but not worth a
-- trigger, and the form already restricts to real dates.
alter table public.users
  drop constraint if exists users_birth_month_valid,
  add constraint users_birth_month_valid
    check ("birthMonth" is null or ("birthMonth" between 1 and 12));

alter table public.users
  drop constraint if exists users_birth_day_valid,
  add constraint users_birth_day_valid
    check ("birthDay" is null or ("birthDay" between 1 and 31));

-- Both or neither: half a birthday can't be greeted, and a stray month with
-- no day would sit in the data forever looking like a bug.
alter table public.users
  drop constraint if exists users_birthday_complete,
  add constraint users_birthday_complete
    check (("birthMonth" is null) = ("birthDay" is null));

-- Avatars. Private like `invoices`, not public like a CDN: these are staff
-- photographs, and a public bucket means a guessable URL is world-readable
-- forever. Reads go through a short-lived signed URL instead.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Paths are {orgId}/{userId}.{ext}, so the same first-segment org scoping the
-- other two buckets use applies here unchanged.
drop policy if exists "avatars: staff read within org" on storage.objects;
create policy "avatars: staff read within org"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

drop policy if exists "avatars: staff write within org" on storage.objects;
create policy "avatars: staff write within org"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

drop policy if exists "avatars: staff update within org" on storage.objects;
create policy "avatars: staff update within org"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_org_id()
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

drop policy if exists "avatars: staff delete within org" on storage.objects;
create policy "avatars: staff delete within org"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

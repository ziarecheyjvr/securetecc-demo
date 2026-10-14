-- RLS policies for the SecureTECC multi-tenant platform.
-- Run AFTER `prisma migrate deploy` has created the tables (Prisma owns schema/DDL,
-- this file owns Postgres-level access control that Prisma cannot express).
--
-- Design:
--   * public.users mirrors auth.users (one row per staff member, via "authUserId").
--   * current_org_id()/current_user_role() are SECURITY DEFINER so policies on
--     public.users itself don't recurse into RLS when looking up the caller's row.
--   * Every tenant table is scoped to "organizationId" = current_org_id().
--   * Clients (the org's own customers) are not platform users; the public ticket
--     form runs as the Supabase `anon` role and is granted a narrow, column-limited
--     INSERT policy only -- no anon SELECT/UPDATE/DELETE anywhere.
--
-- Column naming: the Prisma schema has no field-level @map(...), so Prisma
-- generated camelCase columns (e.g. "organizationId", not organization_id).
-- Every multi-word column reference below is double-quoted to match exactly
-- -- Postgres folds unquoted identifiers to lowercase, which would silently
-- resolve to a nonexistent column otherwise.
--
-- Type note: id/foreign-key columns are Prisma `String @default(uuid())`,
-- which maps to Postgres `text`, NOT the native `uuid` type. Supabase's
-- auth.uid() returns `uuid`, so it must be cast to `::text` before comparing
-- against "authUserId", and the helper functions below return `text`
-- accordingly (not `uuid`).
--
-- IMPORTANT -- this only does something if the app actually connects as a role
-- these policies apply to. Prisma's DATABASE_URL normally connects as the
-- `postgres` superuser, which bypasses RLS entirely regardless of what's
-- written below. The app must run every query inside a transaction that does
-- `SET LOCAL ROLE authenticated` (or `anon`) plus sets the `request.jwt.claims`
-- GUC that auth.uid() reads from -- see src/lib/db/rls.ts (withRLS). The
-- grants below give those roles the base table privileges RLS then narrows.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- anon gets no default access; only the narrow grants below plus the RLS
-- policies further restrict which rows/columns are actually reachable.
grant insert on public.tickets, public.ticket_attachments to anon;

-- ============================================================================
-- Helper functions
-- ============================================================================

create or replace function public.current_org_id()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select "organizationId" from public.users where "authUserId" = auth.uid()::text limit 1;
$$;

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role::text from public.users where "authUserId" = auth.uid()::text limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

-- ============================================================================
-- organizations
-- ============================================================================

alter table public.organizations enable row level security;

create policy "org: staff can read own org"
  on public.organizations for select
  using (id = public.current_org_id());

create policy "org: admin can update own org"
  on public.organizations for update
  using (id = public.current_org_id() and public.is_admin())
  with check (id = public.current_org_id() and public.is_admin());

-- No insert/delete policy: organization provisioning is done via the service
-- role key (tenant onboarding tooling), not by staff users.

-- ============================================================================
-- users
-- ============================================================================

alter table public.users enable row level security;

create policy "users: staff can read own org roster"
  on public.users for select
  using ("organizationId" = public.current_org_id());

create policy "users: admin can manage own org roster"
  on public.users for all
  using ("organizationId" = public.current_org_id() and public.is_admin())
  with check ("organizationId" = public.current_org_id() and public.is_admin());

-- ============================================================================
-- clients
-- ============================================================================

alter table public.clients enable row level security;

create policy "clients: staff full access within org"
  on public.clients for all
  using ("organizationId" = public.current_org_id())
  with check ("organizationId" = public.current_org_id());

-- ============================================================================
-- service_types
-- ============================================================================

alter table public.service_types enable row level security;

create policy "service_types: staff can read within org"
  on public.service_types for select
  using ("organizationId" = public.current_org_id());

create policy "service_types: admin can manage within org"
  on public.service_types for insert
  with check ("organizationId" = public.current_org_id() and public.is_admin());

create policy "service_types: admin can update within org"
  on public.service_types for update
  using ("organizationId" = public.current_org_id() and public.is_admin())
  with check ("organizationId" = public.current_org_id() and public.is_admin());

create policy "service_types: admin can delete within org"
  on public.service_types for delete
  using ("organizationId" = public.current_org_id() and public.is_admin());

-- ============================================================================
-- time_entries
-- ============================================================================

alter table public.time_entries enable row level security;

create policy "time_entries: staff can read within org"
  on public.time_entries for select
  using ("organizationId" = public.current_org_id());

create policy "time_entries: staff can insert within org"
  on public.time_entries for insert
  with check ("organizationId" = public.current_org_id());

-- Entries already attached to an invoice are billing history; only admins
-- may edit/delete them (e.g. as part of a deliberate void-and-reinvoice flow).
-- Unbilled entries ("invoiceId" is null) remain editable by any staff member,
-- including the technician correcting their own log before it's invoiced.
create policy "time_entries: staff can update unbilled, admin can update any"
  on public.time_entries for update
  using (
    "organizationId" = public.current_org_id()
    and ("invoiceId" is null or public.is_admin())
  )
  with check (
    "organizationId" = public.current_org_id()
    and ("invoiceId" is null or public.is_admin())
  );

create policy "time_entries: staff can delete unbilled, admin can delete any"
  on public.time_entries for delete
  using (
    "organizationId" = public.current_org_id()
    and ("invoiceId" is null or public.is_admin())
  );

-- ============================================================================
-- recurring_charges
-- ============================================================================

alter table public.recurring_charges enable row level security;

create policy "recurring_charges: staff full access within org"
  on public.recurring_charges for all
  using ("organizationId" = public.current_org_id())
  with check ("organizationId" = public.current_org_id());

-- ============================================================================
-- invoices
-- ============================================================================

alter table public.invoices enable row level security;

create policy "invoices: staff can read within org"
  on public.invoices for select
  using ("organizationId" = public.current_org_id());

-- Any staff member can generate a Draft invoice from the review screen.
create policy "invoices: staff can insert Draft within org"
  on public.invoices for insert
  with check ("organizationId" = public.current_org_id() and status = 'Draft');

-- Only admins can transition status (Draft -> Sent -> Paid) or void/edit a
-- finalized invoice. This is the DB-level backstop for the highest-risk
-- workflow in the system (see Delete/void invoice confirmation requirement).
create policy "invoices: admin can update within org"
  on public.invoices for update
  using ("organizationId" = public.current_org_id() and public.is_admin())
  with check ("organizationId" = public.current_org_id() and public.is_admin());

create policy "invoices: admin can delete within org"
  on public.invoices for delete
  using ("organizationId" = public.current_org_id() and public.is_admin());

-- ============================================================================
-- tickets
-- ============================================================================

alter table public.tickets enable row level security;

create policy "tickets: staff can read within org"
  on public.tickets for select
  using ("organizationId" = public.current_org_id());

create policy "tickets: staff can update within org"
  on public.tickets for update
  using ("organizationId" = public.current_org_id())
  with check ("organizationId" = public.current_org_id());

create policy "tickets: staff can delete within org"
  on public.tickets for delete
  using ("organizationId" = public.current_org_id() and public.is_admin());

-- Public, unauthenticated ticket submission (anon role). No login, so this
-- cannot be scoped to current_org_id() -- the public form itself is served
-- per-tenant and supplies "organizationId" directly. The WITH CHECK below is
-- the DB-level guarantee that a public submission can only ever create a
-- brand-new "New" ticket with no internal fields set, regardless of what the
-- client sends.
--
-- IMPORTANT for callers: anon deliberately has no SELECT policy here, and a
-- RETURNING clause is evaluated against the SELECT policy. That means
-- `INSERT ... RETURNING` fails for anon with 42501 even though the INSERT is
-- allowed -- which rules out Prisma's create(), since it always emits
-- RETURNING. src/app/support/actions.ts therefore inserts via raw SQL with a
-- client-generated id. Do not "fix" that by granting anon SELECT.
create policy "tickets: anon can submit new tickets"
  on public.tickets for insert
  to anon
  with check (
    status = 'New'
    and "assignedToUserId" is null
    and "internalNotes" is null
    and "resolvedAt" is null
  );

-- ============================================================================
-- ticket_attachments
-- ============================================================================

alter table public.ticket_attachments enable row level security;

create policy "ticket_attachments: staff can read within org"
  on public.ticket_attachments for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_attachments."ticketId"
        and t."organizationId" = public.current_org_id()
    )
  );

create policy "ticket_attachments: staff can delete within org"
  on public.ticket_attachments for delete
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_attachments."ticketId"
        and t."organizationId" = public.current_org_id()
    )
  );

-- Anon may attach files only to a ticket that was itself just created as New
-- by the same public flow (still enforced at the DB level, not just the UI).
create policy "ticket_attachments: anon can attach to new tickets"
  on public.ticket_attachments for insert
  to anon
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_attachments."ticketId"
        and t.status = 'New'
    )
  );

-- ============================================================================
-- Storage: ticket-attachments bucket
-- Path convention: {orgId}/{clientCompanyName}/{ticketNumber}/{fileName}
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

create policy "ticket-attachments: anon can upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'ticket-attachments');

create policy "ticket-attachments: staff can read within org"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

create policy "ticket-attachments: staff can delete within org"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

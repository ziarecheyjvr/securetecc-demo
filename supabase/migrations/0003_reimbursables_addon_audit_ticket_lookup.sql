-- Adds RLS for the three new tables from prisma/migrations/20260822142435
-- (reimbursable_expenses, recurring_charge_audit_log, addon_pricing) plus a
-- SECURITY DEFINER function backing the public ticket-status-lookup page.
-- Run AFTER `prisma migrate deploy`, same convention as 0001/0002.

-- ============================================================================
-- reimbursable_expenses
-- ============================================================================
-- Mirrors time_entries' three policies exactly: same billing lifecycle, same
-- "unbilled is editable by any staff member, billed needs an admin" shape.

alter table public.reimbursable_expenses enable row level security;

create policy "reimbursable_expenses: staff can read within org"
  on public.reimbursable_expenses for select
  using ("organizationId" = public.current_org_id());

create policy "reimbursable_expenses: staff can insert within org"
  on public.reimbursable_expenses for insert
  with check ("organizationId" = public.current_org_id());

create policy "reimbursable_expenses: staff can update unbilled, admin can update any"
  on public.reimbursable_expenses for update
  using (
    "organizationId" = public.current_org_id()
    and ("invoiceId" is null or public.is_admin())
  )
  with check (
    "organizationId" = public.current_org_id()
    and ("invoiceId" is null or public.is_admin())
  );

create policy "reimbursable_expenses: staff can delete unbilled, admin can delete any"
  on public.reimbursable_expenses for delete
  using (
    "organizationId" = public.current_org_id()
    and ("invoiceId" is null or public.is_admin())
  );

-- ============================================================================
-- recurring_charge_audit_log
-- ============================================================================
-- Deliberately NO update/delete policy at all -- immutability is enforced at
-- the DB level, not just by app-code convention (nothing can rewrite or erase
-- a row here regardless of role, short of the service-role/superuser
-- connection Prisma normally uses, which bypasses RLS entirely).

alter table public.recurring_charge_audit_log enable row level security;

create policy "recurring_charge_audit_log: staff can read within org"
  on public.recurring_charge_audit_log for select
  using ("organizationId" = public.current_org_id());

create policy "recurring_charge_audit_log: staff can insert within org"
  on public.recurring_charge_audit_log for insert
  with check ("organizationId" = public.current_org_id());

-- ============================================================================
-- addon_pricing
-- ============================================================================
-- Same shape as service_types: staff read, admin write. Reference-only data,
-- never read by billing logic -- purely a UI pre-fill suggestion.

alter table public.addon_pricing enable row level security;

create policy "addon_pricing: staff can read within org"
  on public.addon_pricing for select
  using ("organizationId" = public.current_org_id());

create policy "addon_pricing: admin can insert within org"
  on public.addon_pricing for insert
  with check ("organizationId" = public.current_org_id() and public.is_admin());

create policy "addon_pricing: admin can update within org"
  on public.addon_pricing for update
  using ("organizationId" = public.current_org_id() and public.is_admin())
  with check ("organizationId" = public.current_org_id() and public.is_admin());

create policy "addon_pricing: admin can delete within org"
  on public.addon_pricing for delete
  using ("organizationId" = public.current_org_id() and public.is_admin());

-- ============================================================================
-- Public ticket status lookup
-- ============================================================================
-- 0001_rls_policies.sql deliberately gives anon NO select policy on tickets
-- ("the public must never read tickets back" -- do not add one). A lookup
-- feature still needs SOME way to answer "what's the status of ticket X",
-- scoped to only the caller who knows both the ticket number AND the email
-- it was filed under. A blanket anon SELECT policy can't express that --
-- `USING` filters rows, it can't require "the query's WHERE matched these two
-- values" -- so anon with `using (true)` could just omit the email filter and
-- read every ticket. A SECURITY DEFINER function (same pattern as
-- current_org_id()/is_admin() above) sidesteps this: it bypasses RLS
-- internally under controlled conditions and returns only a narrow, safe
-- column set, so the tickets table itself never gets an anon SELECT policy.
--
-- No row back (not an error) on a mismatch on EITHER field -- the caller can
-- never tell whether the ticket number or the email was wrong.

create or replace function public.lookup_ticket_status(
  p_ticket_number text,
  p_contact_email text
)
returns table (
  ticket_number text,
  status text,
  submitted_at timestamptz,
  issue_type text
)
language sql
security definer
set search_path = public
stable
as $$
  select "ticketNumber", status::text, "createdAt", "issueType"
  from public.tickets
  where "ticketNumber" = p_ticket_number
    and lower("contactEmail") = lower(p_contact_email);
$$;

grant execute on function public.lookup_ticket_status(text, text) to anon;

-- RLS for invoice_retainer_periods (prisma migration 20260823..._invoice_retainer_periods).
-- Mirrors invoice_recurring_charges exactly: these are immutable billing
-- snapshots, so there is deliberately NO update policy -- a row is inserted at
-- generation and deleted only when its invoice is voided.

alter table public.invoice_retainer_periods enable row level security;

create policy "invoice_retainer_periods: staff can read within org"
  on public.invoice_retainer_periods for select
  using ("organizationId" = public.current_org_id());

create policy "invoice_retainer_periods: staff can insert within org"
  on public.invoice_retainer_periods for insert
  with check ("organizationId" = public.current_org_id());

-- Void is admin-only (see the invoices policies), and voiding is the only
-- thing that removes these rows.
create policy "invoice_retainer_periods: admin can delete within org"
  on public.invoice_retainer_periods for delete
  using ("organizationId" = public.current_org_id() and public.is_admin());

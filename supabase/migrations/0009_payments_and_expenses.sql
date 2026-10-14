-- Payments and business expenses.
--
-- Both are money records, and both follow the shape the rest of the app uses:
-- staff read and write within their own organization, admins alone may delete.
-- Deleting a payment rewrites history, which is exactly the operation that
-- should need the higher privilege.

alter table public.payments enable row level security;

drop policy if exists "payments: staff read within org" on public.payments;
create policy "payments: staff read within org"
  on public.payments for select
  to authenticated
  using ("organizationId" = public.current_org_id());

drop policy if exists "payments: staff insert within org" on public.payments;
create policy "payments: staff insert within org"
  on public.payments for insert
  to authenticated
  with check ("organizationId" = public.current_org_id());

drop policy if exists "payments: staff update within org" on public.payments;
create policy "payments: staff update within org"
  on public.payments for update
  to authenticated
  using ("organizationId" = public.current_org_id())
  with check ("organizationId" = public.current_org_id());

drop policy if exists "payments: admin delete within org" on public.payments;
create policy "payments: admin delete within org"
  on public.payments for delete
  to authenticated
  using ("organizationId" = public.current_org_id() and public.is_admin());

alter table public.business_expenses enable row level security;

drop policy if exists "business_expenses: staff read within org" on public.business_expenses;
create policy "business_expenses: staff read within org"
  on public.business_expenses for select
  to authenticated
  using ("organizationId" = public.current_org_id());

-- What the business spends is an admin's to record: it drives the
-- profitability figures, and a technician has no reason to write it.
drop policy if exists "business_expenses: admin writes within org" on public.business_expenses;
create policy "business_expenses: admin writes within org"
  on public.business_expenses for all
  to authenticated
  using ("organizationId" = public.current_org_id() and public.is_admin())
  with check ("organizationId" = public.current_org_id() and public.is_admin());

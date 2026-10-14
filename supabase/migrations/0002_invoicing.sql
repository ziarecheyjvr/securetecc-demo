-- Phase 3 (Invoicing) access control. Run AFTER the Prisma migration
-- `invoicing_recurring_charge_snapshots` has created the tables.
--
-- Conventions carried over from 0001 (read that file's header first):
--   * Prisma has no field-level @map, so every multi-word column is
--     camelCase and MUST be double-quoted here.
--   * id/FK columns are Prisma `String`, i.e. Postgres `text`, NOT `uuid`.
--     public.current_org_id() returns text to match.
--
-- Note on recurring_charges: it deliberately keeps its single blanket
-- "staff full access within org" policy from 0001. Unlike time_entries there
-- is no billed/unbilled split to enforce, because a RecurringCharge is a
-- perpetual template that is never stamped with an invoiceId -- billing
-- history lives in invoice_recurring_charges instead, and those rows are
-- immutable snapshots, so editing a template can't corrupt a past invoice.

-- ============================================================================
-- invoice_recurring_charges
-- ============================================================================

grant select, insert, delete on public.invoice_recurring_charges to authenticated;

alter table public.invoice_recurring_charges enable row level security;

create policy "invoice_recurring_charges: staff can read within org"
  on public.invoice_recurring_charges for select
  using ("organizationId" = public.current_org_id());

-- Written during Draft-invoice generation. Same permission level as the
-- existing "invoices: staff can insert Draft within org" policy -- any staff
-- member may generate a Draft.
create policy "invoice_recurring_charges: staff can insert within org"
  on public.invoice_recurring_charges for insert
  with check ("organizationId" = public.current_org_id());

-- Only removed as part of voiding an invoice, which is admin-only -- mirrors
-- "invoices: admin can delete within org". Deleting the row is what re-opens
-- that recurring charge for that period on a re-generated invoice.
create policy "invoice_recurring_charges: admin can delete within org"
  on public.invoice_recurring_charges for delete
  using ("organizationId" = public.current_org_id() and public.is_admin());

-- Intentionally no UPDATE policy: these rows are immutable billing snapshots.
-- Correcting one means voiding the invoice and regenerating it.

-- ============================================================================
-- Storage: invoices bucket
-- Path convention: {orgId}/{clientId}/{invoiceId}.pdf
--   voided -> {orgId}/archived/{clientId}/{invoiceId}.pdf
-- orgId stays the first segment either way so the folder-based org scoping
-- below keeps working after archival.
--
-- Invoices are never public: no `anon` grants at all here, unlike the
-- ticket-attachments bucket in 0001 which needs anon INSERT for the public
-- support form.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "invoices-bucket: staff can read within org"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

create policy "invoices-bucket: staff can upload within org"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

-- Needed for the archive-on-void move, and for re-rendering a Draft's PDF.
create policy "invoices-bucket: admin can update within org"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.current_org_id()
  )
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.current_org_id()
  );

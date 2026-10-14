-- Every other table in this schema has RLS on. A new one without it is either
-- wide open or (once GRANTs are considered) silently unwritable -- the same
-- failure mode ticket_attachments just had.
alter table public.invoice_custom_items enable row level security;

grant select, insert, update, delete on public.invoice_custom_items to authenticated;

-- Scoped through the parent invoice's organization, matching how
-- invoice_recurring_charges and invoice_retainer_periods are scoped.
create policy "invoice_custom_items: staff full access within org"
  on public.invoice_custom_items for all
  to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_custom_items."invoiceId"
        and i."organizationId" = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_custom_items."invoiceId"
        and i."organizationId" = public.current_org_id()
    )
  );

-- anon could upload a ticket attachment to storage but not record it: the
-- GRANT on ticket_attachments existed (0001 line 42) while the INSERT policy
-- never did, so RLS rejected every row with 42501. The submitter saw
-- "couldn't be attached" and the file was orphaned in the bucket.

-- The policy needs to check the parent ticket exists, but anon has no SELECT
-- on tickets and must not get one (see the note above the tickets policies).
-- Same SECURITY DEFINER escape hatch as lookup_ticket_status.
create or replace function public.ticket_accepts_attachment(p_ticket_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  -- Time-boxed deliberately. Attachments are written seconds after the ticket
  -- in the same request, so an hour is generous; without the bound, anyone who
  -- guessed a ticket's uuid could staple files to it indefinitely.
  select exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id
      and t."createdAt" > now() - interval '1 hour'
  );
$$;

revoke all on function public.ticket_accepts_attachment(text) from public;
grant execute on function public.ticket_accepts_attachment(text) to anon;

create policy "ticket_attachments: anon can attach to a just-created ticket"
  on public.ticket_attachments for insert
  to anon
  with check (public.ticket_accepts_attachment("ticketId"));

-- ============================================================
-- AURA OS — migration 0180: tender register depth (§2.2 — T4)
-- ------------------------------------------------------------
-- 1. Source classification: the vision's register reads "Invitations · Opportunities ·
--    Public · Private" — WHERE a tender came from, orthogonal to its status. Nullable:
--    an unclassified legacy row shows as unclassified rather than guessing. Backfilled
--    to 'opportunity' where the deal-chain provenance (source_opportunity_id) proves it.
--
-- 2. Clarifications & addenda: the Q&A and change traffic between register and submission.
--      kind                 — 'clarification' (RFI we raised) | 'addendum' (client-issued change)
--      reference/title/body — the client-side number, subject, and the ask/change itself
--      issued_at/response_due — the clock
--      answer/answered_at   — the answer (clarification) / our acknowledgement (addendum)
--      deadline_extended_to — addendum only: the new submission deadline it grants (the
--                             service mirrors it onto the tender)
--    Never deleted — the paper trail is the point; a T2 submission's addenda_acknowledged
--    refers to these by reference.
-- ============================================================

alter table public.aura_tendering_tenders
  add column if not exists source text;

update public.aura_tendering_tenders
  set source = 'opportunity'
  where source is null and source_opportunity_id is not null;

create index if not exists idx_aura_tendering_source on public.aura_tendering_tenders (tenant_id, source);

create table if not exists public.aura_tendering_clarifications (
  id                   uuid        primary key,
  tenant_id            text        not null,
  company_id           text,
  tender_id            text        not null,
  kind                 text        not null default 'clarification',
  reference            text,
  title                text        not null,
  body                 text,
  issued_at            date        not null default current_date,
  response_due         date,
  answer               text,
  answered_at          timestamptz,
  deadline_extended_to date,
  created_by           text,
  created_at           timestamptz not null default now()
);

create index if not exists idx_tendering_clarifications_tenant on public.aura_tendering_clarifications (tenant_id, issued_at desc);
create index if not exists idx_tendering_clarifications_tender on public.aura_tendering_clarifications (tender_id);

alter table public.aura_tendering_clarifications enable row level security;
alter table public.aura_tendering_clarifications force row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_tendering_clarifications' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_tendering_clarifications
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_tendering_clarifications;
drop index if exists public.idx_aura_tendering_source;
alter table public.aura_tendering_tenders drop column if exists source;

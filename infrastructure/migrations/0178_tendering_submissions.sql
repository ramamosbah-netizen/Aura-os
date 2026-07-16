-- ============================================================
-- AURA OS — migration 0178: tender submissions (§2.2 — T2)
-- ------------------------------------------------------------
-- Before T2 the submission milestone was one enum value (`tenders.status = 'submitted'`) — no
-- record of what went out, when, by whom, through which channel, under which reference, against
-- which addenda. One row per bid actually submitted:
--
--   submitted_at/by       — the fact: when it went out and who took it out the door
--   method/portal         — the channel (portal / email / in_person / courier / other)
--   reference             — the client-side receipt / submission reference
--   submitted_value       — value SNAPSHOT at submission (later BOQ edits can't rewrite the offer)
--   addenda_acknowledged  — which addenda/clarifications this submission answers
--   valid_until           — bid validity date
--
-- Append-only in spirit: a resubmission is a second row, never an edit. Every route into
-- `status = 'submitted'` writes one, and the won/lost gate reads it as evidence.
-- ============================================================

create table if not exists public.aura_tendering_submissions (
  id                   uuid        primary key,
  tenant_id            text        not null,
  company_id           text,
  tender_id            text        not null,
  tender_title         text,
  submitted_at         timestamptz not null default now(),
  submitted_by         text,
  method               text        not null default 'other',
  portal               text,
  reference            text,
  submitted_value      numeric     not null default 0,
  addenda_acknowledged text,
  valid_until          date,
  notes                text,
  created_by           text,
  created_at           timestamptz not null default now()
);

create index if not exists idx_tendering_submissions_tenant on public.aura_tendering_submissions (tenant_id, submitted_at desc);
create index if not exists idx_tendering_submissions_tender on public.aura_tendering_submissions (tender_id);

alter table public.aura_tendering_submissions enable row level security;
alter table public.aura_tendering_submissions force row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_tendering_submissions' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_tendering_submissions
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- Backfill: tenders already at/past the submission milestone get a synthetic record, so the
-- won/lost gate (which now reads the record, not the status label) never strands a live row.
-- The true when/who/how were never captured — created_at is the honest best-available timestamp
-- and the note says so.
insert into public.aura_tendering_submissions
  (id, tenant_id, company_id, tender_id, tender_title, submitted_at, submitted_by, method,
   submitted_value, notes, created_at)
select gen_random_uuid(), t.tenant_id, t.company_id, t.id::text, t.title, t.created_at, null, 'other',
       t.value, 'Backfilled from tender status (pre-T2) — submission facts were not recorded at the time.', now()
from public.aura_tendering_tenders t
where t.status in ('submitted', 'won', 'lost')
  and not exists (
    select 1 from public.aura_tendering_submissions s where s.tender_id = t.id::text
  );

-- @DOWN
drop table if exists public.aura_tendering_submissions;

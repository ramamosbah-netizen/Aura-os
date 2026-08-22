-- ============================================================
-- AURA OS — migration 0242: Lead Qualification Decisions (audit)
-- ------------------------------------------------------------
-- The immutable, append-only record of a HUMAN decision to qualify a lead: who decided, when, from
-- which lifecycle status, and the EXACT evidence (raw dimensions + derived assessment) that stood at
-- that instant. A lead's qualification score and verdict are not stored — they are pure functions of
-- the dimensions, recomputed on every read — so a later reassessment silently changes the current
-- verdict. This table freezes the decision-time evidence so "on what basis, and by whom, was this
-- lead qualified?" stays answerable forever.
--
-- Written ONCE, inside the same transaction as the status change (a successful non-qualified →
-- qualified transition ⇒ exactly one row here + one lifecycle event). APPEND-ONLY IS ENFORCED, not
-- merely conventional: BEFORE UPDATE/DELETE triggers reject any mutation of a written decision.
--
-- The schema carries no global UNIQUE (tenant_id, lead_id): that would forbid a future
-- qualified → reopened → qualified again cycle. It is requalification-COMPATIBLE — not a claim that
-- requalification is supported today (the audit found no formal lead transition model). Protection
-- against concurrent-duplicate qualification comes from the serialized SELECT … FOR UPDATE
-- transition in the service, not from a synthetic uniqueness constraint.
--
-- Ships with RLS enabled + FORCED + the canonical tenant policy (R1 fitness gate requires every
-- tenant-scoped aura_* table to be protected). Additive.
-- ============================================================

create table if not exists public.aura_crm_lead_qualification_decisions (
  id                   uuid primary key,
  tenant_id            text not null,
  company_id           text,
  lead_id              text not null,
  from_status          text not null,
  to_status            text not null default 'qualified',
  qualified_by         text,
  qualified_at         timestamptz not null default now(),
  evidence_snapshot    jsonb not null default '{}'::jsonb,
  reason               text,
  created_at           timestamptz not null default now()
);

create index if not exists idx_crm_lead_qual_decisions_tenant on public.aura_crm_lead_qualification_decisions (tenant_id);
create index if not exists idx_crm_lead_qual_decisions_lead   on public.aura_crm_lead_qualification_decisions (tenant_id, lead_id, qualified_at desc);

alter table public.aura_crm_lead_qualification_decisions enable row level security;
alter table public.aura_crm_lead_qualification_decisions force row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_lead_qualification_decisions' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_lead_qualification_decisions
      for all
      using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)
      with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);
  end if;
end $$;

-- Append-only BY DESIGN, enforced at the database: a written decision can never be altered or removed.
create or replace function public.aura_crm_qual_decision_immutable() returns trigger
  language plpgsql as $$
begin
  raise exception 'aura_crm_lead_qualification_decisions is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_crm_qual_decision_no_update on public.aura_crm_lead_qualification_decisions;
create trigger trg_crm_qual_decision_no_update
  before update on public.aura_crm_lead_qualification_decisions
  for each row execute function public.aura_crm_qual_decision_immutable();

drop trigger if exists trg_crm_qual_decision_no_delete on public.aura_crm_lead_qualification_decisions;
create trigger trg_crm_qual_decision_no_delete
  before delete on public.aura_crm_lead_qualification_decisions
  for each row execute function public.aura_crm_qual_decision_immutable();

-- @DOWN
drop trigger if exists trg_crm_qual_decision_no_delete on public.aura_crm_lead_qualification_decisions;
drop trigger if exists trg_crm_qual_decision_no_update on public.aura_crm_lead_qualification_decisions;
drop function if exists public.aura_crm_qual_decision_immutable();
drop table if exists public.aura_crm_lead_qualification_decisions;

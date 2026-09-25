-- ============================================================
-- 0390 — QUALITY RECEIVES WHAT T&C ESCALATES (TC-08), enforced by the database.
--
-- The programme owner's decision (2026-09-25): an escalated commissioning defect lands in QA/QC's queue
-- for the project, and Quality DECIDES it — either raises a non-conformance from it (linked back to the
-- defect and its failing run) or records, with a reason, that it is not a non-conformance. T&C sees the
-- outcome. Before this, T&C only recorded that it had asked, and Quality received nothing.
--
-- The escalation is QUALITY'S record: T&C's request creates it, and only a Quality decision changes it.
--   1. one escalation per defect;
--   2. a decision is complete — an NCR raised names the NCR; "not a non-conformance" carries a reason;
--   3. whoever asked does not decide (the requester is T&C; the decider is Quality);
--   4. a decided escalation is immutable, and is never deleted.
-- ============================================================

create table if not exists public.aura_quality_escalations (
  id                uuid primary key,
  tenant_id         text not null,
  company_id        text,
  project_id        uuid not null,
  source_type       text not null,
  source_id         uuid not null,
  source_reference  text,
  system            text,
  description       text not null,
  severity          text,
  point_no          text,
  failing_run_no    integer,
  failing_actual    text,
  failing_remarks   text,
  requested_by      text not null,
  requested_at      timestamptz not null,
  status            text not null default 'pending',
  ncr_id            uuid,
  decision_reason   text,
  decided_by        text,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint aura_quality_escalation_source check (source_type = 'commissioning.punch'),
  constraint aura_quality_escalation_status check (status in ('pending', 'ncr_raised', 'not_nonconformance')),
  constraint aura_quality_escalation_decision check (
    (status = 'pending' and ncr_id is null and decision_reason is null and decided_by is null and decided_at is null)
    or (status = 'ncr_raised' and ncr_id is not null and decided_by is not null and decided_at is not null)
    or (status = 'not_nonconformance' and ncr_id is null and coalesce(length(btrim(decision_reason)), 0) > 0 and decided_by is not null and decided_at is not null)
  ),
  constraint aura_quality_escalation_independent check (decided_by is null or decided_by <> requested_by)
);

create unique index if not exists uq_aura_quality_escalation_source
  on public.aura_quality_escalations (tenant_id, source_type, source_id);
create index if not exists ix_aura_quality_escalation_project
  on public.aura_quality_escalations (tenant_id, project_id, status);

alter table public.aura_quality_escalations enable row level security;
alter table public.aura_quality_escalations force row level security;
drop policy if exists tenant_isolation on public.aura_quality_escalations;
create policy tenant_isolation on public.aura_quality_escalations
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

create or replace function public.aura_quality_escalation_guard() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception using errcode = '23514', message = 'a decided escalation is immutable and is never deleted';
    end if;
    return old;
  end if;
  if old.status <> 'pending' then
    raise exception using errcode = '23514', message = 'a decided escalation is immutable';
  end if;
  if new.source_type is distinct from old.source_type or new.source_id is distinct from old.source_id
     or new.project_id is distinct from old.project_id or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at then
    raise exception using errcode = '23514', message = 'an escalation''s request is immutable — what was asked, by whom and when';
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_quality_escalation_guard on public.aura_quality_escalations;
create trigger aura_quality_escalation_guard
  before update or delete on public.aura_quality_escalations
  for each row execute function public.aura_quality_escalation_guard();

do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant select, insert, update, delete on public.aura_quality_escalations to aura_app;
  end if;
end $grant$;

-- @DOWN
drop trigger if exists aura_quality_escalation_guard on public.aura_quality_escalations;
drop function if exists public.aura_quality_escalation_guard();
drop table if exists public.aura_quality_escalations;

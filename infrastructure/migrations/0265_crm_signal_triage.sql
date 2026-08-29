-- ============================================================
-- AURA OS — migration 0265: CRM Signal triage evidence
-- ------------------------------------------------------------
-- Adds review/dismissal evidence and a database guard for the
-- Signal → Lead lineage. This is additive; no applied migration
-- is edited.
-- ============================================================

alter table public.aura_crm_signals
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists dismissal_reason_code text,
  add column if not exists dismissal_note text;

-- A signal can produce at most one Lead in a tenant. If legacy data violates
-- this invariant, fail loudly instead of silently choosing a winner.
do $$
begin
  if exists (
    select 1
    from public.aura_crm_leads
    where signal_id is not null
    group by tenant_id, signal_id
    having count(*) > 1
  ) then
    raise exception 'cannot create signal lineage guard: duplicate lead signal_id rows exist';
  end if;
end $$;

create unique index if not exists uq_crm_leads_signal_lineage
  on public.aura_crm_leads (tenant_id, signal_id)
  where signal_id is not null;

-- @DOWN
drop index if exists public.uq_crm_leads_signal_lineage;
alter table public.aura_crm_signals
  drop column if exists dismissal_note,
  drop column if exists dismissal_reason_code,
  drop column if exists reviewed_at,
  drop column if exists reviewed_by;

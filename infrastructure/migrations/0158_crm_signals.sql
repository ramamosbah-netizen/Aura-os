-- ============================================================
-- AURA OS — migration 0158: CRM Signals + Opportunity Radar (S3)
-- ------------------------------------------------------------
-- A Signal is a pre-lead commercial possibility ("something happened worth investigating").
-- The Opportunity Radar triages open signals; promotion creates a Lead and preserves source
-- attribution (Signal → Lead → Opportunity). dedupe_key lets growth reactors stay idempotent.
-- Also adds the reverse lineage pointer signal_id on leads. Additive.
-- ============================================================

create table if not exists public.aura_crm_signals (
  id                uuid primary key,
  tenant_id         text not null,
  company_id        text,
  title             text not null,
  description       text,
  source            text not null,
  type              text not null,
  account_id        text,
  account_name      text,
  contact_id        text,
  context_type      text,
  context_id        text,
  evidence          text,
  confidence        integer not null default 50,
  detected_at       timestamptz not null default now(),
  owner_id          text,
  status            text not null default 'NEW',
  promoted_lead_id  text,
  dismissal_reason  text,
  dedupe_key        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_crm_signals_tenant  on public.aura_crm_signals (tenant_id);
create index if not exists idx_crm_signals_status  on public.aura_crm_signals (tenant_id, status);
create index if not exists idx_crm_signals_account on public.aura_crm_signals (account_id);
-- One live signal per dedupe key — reactors upsert against this instead of duplicating.
create unique index if not exists uq_crm_signals_dedupe
  on public.aura_crm_signals (tenant_id, dedupe_key) where dedupe_key is not null;

alter table public.aura_crm_signals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_signals' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_signals
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

alter table public.aura_crm_leads
  add column if not exists signal_id text;

-- @DOWN
alter table public.aura_crm_leads drop column if exists signal_id;
drop table if exists public.aura_crm_signals;

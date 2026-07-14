-- ============================================================
-- AURA OS — migration 0165: Commercial Baseline (Roadmap R3 / G-P1-1)
-- ------------------------------------------------------------
-- The immutable, point-in-time snapshot of the price a quotation was APPROVED at. Written once
-- on approval and never mutated; a Contract references its baseline so commercial truth is
-- traceable and drift (contract value vs approved price) is measurable. Additive.
-- Ships with RLS enabled + FORCED + the canonical tenant policy (R1 fitness gate requires every
-- tenant-scoped aura_* table to be protected).
-- ============================================================

create table if not exists public.aura_crm_commercial_baselines (
  id                     uuid primary key,
  tenant_id              text not null,
  company_id             text,
  quotation_id           text not null,
  quote_number           text not null,
  revision               integer not null default 0,
  customer_name          text not null,
  account_id             text,
  source_opportunity_id  text,
  source_tender_id       text,
  lines                  jsonb not null default '[]'::jsonb,
  subtotal               numeric not null default 0,
  vat_total              numeric not null default 0,
  total                  numeric not null default 0,
  locked_by              text,
  locked_at              timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

create index if not exists idx_crm_commercial_baselines_tenant     on public.aura_crm_commercial_baselines (tenant_id);
create index if not exists idx_crm_commercial_baselines_quotation  on public.aura_crm_commercial_baselines (quotation_id);

alter table public.aura_crm_commercial_baselines enable row level security;
alter table public.aura_crm_commercial_baselines force row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_commercial_baselines' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_commercial_baselines
      for all
      using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)
      with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);
  end if;
end $$;

-- Contract references the baseline it was created from (nullable — deal-chain/tender contracts
-- may not originate from an approved quotation).
alter table public.aura_contracts_contracts add column if not exists commercial_baseline_id text;

-- @DOWN
alter table public.aura_contracts_contracts drop column if exists commercial_baseline_id;
drop table if exists public.aura_crm_commercial_baselines;

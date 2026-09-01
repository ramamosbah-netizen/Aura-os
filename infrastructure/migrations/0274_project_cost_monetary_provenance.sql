-- ============================================================
-- AURA OS — migration 0274: cost-ledger monetary provenance
-- ------------------------------------------------------------
-- Adds explicit source/base currency evidence to project cost facts. Existing rows are left
-- untouched; NULL provenance denotes legacy/unknown evidence and is never backfilled from a
-- mutable source.
-- ============================================================

alter table public.aura_projects_cost_ledger
  add column if not exists source_amount numeric,
  add column if not exists source_currency text,
  add column if not exists exchange_rate numeric,
  add column if not exists rate_date timestamptz,
  add column if not exists rate_source text,
  add column if not exists base_amount numeric,
  add column if not exists base_currency text;

create index if not exists idx_aura_cost_ledger_project_actual
  on public.aura_projects_cost_ledger (tenant_id, project_id, type);

-- @DOWN
drop index if exists public.idx_aura_cost_ledger_project_actual;
alter table public.aura_projects_cost_ledger
  drop column if exists base_currency,
  drop column if exists base_amount,
  drop column if exists rate_source,
  drop column if exists rate_date,
  drop column if exists exchange_rate,
  drop column if exists source_currency,
  drop column if exists source_amount;

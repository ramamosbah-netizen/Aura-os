-- ============================================================
-- AURA OS — migration 0079: GL company dimension (group consolidation)
-- ------------------------------------------------------------
-- Tags journals with the owning company within the tenant, enabling per-company
-- statements and group consolidation. Nullable (existing rows = unassigned / group level).
-- ============================================================

alter table public.aura_finance_journals
  add column if not exists company_id text;

create index if not exists idx_aura_finance_journals_company
  on public.aura_finance_journals (tenant_id, company_id);

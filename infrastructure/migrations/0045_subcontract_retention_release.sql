-- ============================================================
-- AURA OS — migration 0045: Subcontract Retention Release
-- ------------------------------------------------------------
-- Add support for retention release claims in subcontracts.
-- ============================================================

alter table public.aura_subcontracts_claims 
  add column if not exists is_retention_release boolean not null default false,
  add column if not exists retention_released numeric not null default 0;

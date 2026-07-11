-- ============================================================
-- AURA OS — migration 0143: rate build-ups gain the indirect cost line
-- ------------------------------------------------------------
-- The pricing sheet now carries the FULL cost taxonomy of the legacy sheet:
-- direct cost (incl. equipment rent + other, jsonb components — no DDL) →
-- indirect/preliminaries % (mobilization, supervision, site setup) →
-- overhead % → profit % → selling rate.
-- ============================================================

alter table public.aura_tendering_rate_buildups
  add column if not exists indirect_percent numeric(6,2) not null default 0,
  add column if not exists indirect_amount  numeric(18,2) not null default 0;

-- @DOWN
alter table public.aura_tendering_rate_buildups
  drop column if exists indirect_amount,
  drop column if exists indirect_percent;

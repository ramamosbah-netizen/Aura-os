-- ============================================================
-- AURA OS — migration 0128: normalise `discipline` across engineering aggregates
-- ------------------------------------------------------------
-- ADR-0012 (Shared Dimensions): `discipline` is a shared dimension owned by Engineering. It
-- already existed on technical_queries and bim_models but was ABSENT on drawings/rfis/submittals,
-- breaking cross-discipline filters/KPIs. Backfill the column (default 'other') so every
-- engineering aggregate speaks one vocabulary. Values are the canonical Discipline set.
-- ============================================================

alter table if exists public.aura_engineering_drawings
  add column if not exists discipline text not null default 'other';

alter table if exists public.aura_engineering_rfis
  add column if not exists discipline text not null default 'other';

alter table if exists public.aura_engineering_submittals
  add column if not exists discipline text not null default 'other';

create index if not exists idx_eng_drawings_discipline on public.aura_engineering_drawings (tenant_id, discipline);
create index if not exists idx_eng_rfis_discipline on public.aura_engineering_rfis (tenant_id, discipline);
create index if not exists idx_eng_submittals_discipline on public.aura_engineering_submittals (tenant_id, discipline);

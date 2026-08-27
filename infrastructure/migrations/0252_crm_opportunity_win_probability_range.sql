-- ============================================================
-- AURA OS — migration 0252: win_probability range integrity (persistence boundary)
-- ------------------------------------------------------------
-- `aura_crm_opportunities.win_probability` was NUMERIC(5,2) NOT NULL DEFAULT 20.0 documented as
-- "0 to 100" by a COMMENT and nothing else: no CHECK existed, so 150, -10 and anything up to the
-- type's 999.99 were representable, and a direct SQL write could store any of them.
--
-- This is the third and last of three deliberate restatements of ONE rule, each guarding a
-- different boundary:
--   HTTP        — @Min(0) @Max(100) on the create/update DTOs (crm-opportunities.controller.ts)
--   domain      — assertWinProbability() (shared/src/domain/crm.ts), which every internal caller
--                 hits: tests, jobs, reactors and services that never see a DTO
--   persistence — this constraint, the only one that also binds psql, a migration, or a bug that
--                 gets past the app entirely
--
-- On NaN: NUMERIC (unlike INTEGER) can store NaN, and `JSON.stringify(NaN)` is `null`, so a NaN row
-- would have been served to clients as `"winProbability": null` — violating the non-nullable
-- `winProbability: number` contract. No separate `<> 'NaN'::numeric` clause is needed to stop it.
-- Measured on this database (PostgreSQL 17.6) rather than assumed:
--   'NaN'::numeric >= 0  AND 'NaN'::numeric <= 100   →  FALSE   (so this CHECK rejects NaN)
--   'NaN'::numeric > 100                             →  TRUE    (NaN sorts above every non-NaN)
--   'NaN'::numeric = 'NaN'::numeric                  →  TRUE
--   'NaN'::numeric IS NULL                           →  FALSE
-- A `<> 'NaN'::numeric` clause would therefore be dead weight that reads as load-bearing. The
-- range comparison is the whole rule; the NaN case is covered because NaN <= 100 is false.
--
-- Existing data: a read-only scan before writing this migration found 0 rows out of range, 0 NaN
-- and 0 NULL across the table, so the constraint validates without any backfill.
--
-- NOT NULL already holds (column definition), which is why NULL needs no clause here.
-- ============================================================

alter table public.aura_crm_opportunities
  drop constraint if exists aura_crm_opportunities_win_probability_range;

alter table public.aura_crm_opportunities
  add constraint aura_crm_opportunities_win_probability_range
  check (win_probability >= 0 and win_probability <= 100);

comment on column public.aura_crm_opportunities.win_probability is
  'Salesperson confidence, 0..100 inclusive (enforced by aura_crm_opportunities_win_probability_range). NaN is rejected by that same range check. Reads never re-interpret this value.';

-- @DOWN
alter table public.aura_crm_opportunities
  drop constraint if exists aura_crm_opportunities_win_probability_range;

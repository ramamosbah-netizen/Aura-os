-- ============================================================
-- AURA OS — migration 0174: opportunity forecast category (§23 / G13)
-- ------------------------------------------------------------
-- The forecast had ONE number per deal (win_probability) doing three jobs. §23 separates them:
-- stage probability is DERIVED from the stage (a process property, never stored), sales
-- confidence is the existing win_probability column (it was always the hand-set number), and
-- the model's read stays advisory. What management actually talks in is the CATEGORY:
--
--   forecast_category — the explicit human commitment call (PIPELINE / BEST_CASE / COMMIT).
--                       Nullable on purpose: null = "derive from confidence", which is the
--                       honest default; only a deliberate human call is ever stored. CLOSED
--                       is earned by the stage and never stored. Every existing deal keeps
--                       its derived behaviour — no value is invented.
--
-- No other columns: the rollups (PIPELINE/BEST_CASE/COMMIT/CLOSED) are pure projections.
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists forecast_category text;

-- @DOWN
alter table public.aura_crm_opportunities drop column if exists forecast_category;

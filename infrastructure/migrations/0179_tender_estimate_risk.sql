-- ============================================================
-- AURA OS — migration 0179: estimate risk/contingency layer (§2.2 — T3)
-- ------------------------------------------------------------
-- The vision names four layers over the direct-cost build-up — Indirect / Overhead / Risk /
-- Margin. Indirect, overhead and profit were already first-class; RISK was not, so contingency
-- either hid inside padded rates (invisible, unauditable) or didn't exist. Two columns make it a
-- named, priced layer:
--
--   risk_percent — contingency % on the full cost base (direct + indirect + overhead)
--   risk_amount  — the derived per-unit amount; profit then marks up the base INCLUDING risk
--
-- Additive and zero-defaulted: existing build-ups re-derive to exactly their pre-T3 figures.
-- (The uniqueness law — one build-up per BOQ item — already exists: uq_tender_buildups_boq_item,
-- 0121; T3 hardens the app layer around it instead.)
-- ============================================================

alter table public.aura_tendering_rate_buildups
  add column if not exists risk_percent numeric(6,2) not null default 0,
  add column if not exists risk_amount  numeric(18,2) not null default 0;

-- @DOWN
alter table public.aura_tendering_rate_buildups
  drop column if exists risk_amount,
  drop column if exists risk_percent;

-- ============================================================
-- AURA OS — migration 0250: opportunity award provenance (Slice 9 PR-1)
-- ------------------------------------------------------------
-- When a direct deal is Won from a verified customer award (an accepted quotation), we must be able
-- to answer "why is this Won?" from an authoritative record, not a fragile reconstruction across
-- tables. These additive, nullable columns hold that provenance:
--   awarded_quotation_id  — the exact accepted quotation REVISION the customer awarded
--   contracted_value      — the committed selling value, resolved from that quotation's Commercial
--                           Baseline (never the salesperson's headline `value`)
--   award_source          — which sanctioned path closed it (quotation_accepted | tender_award |
--                           manual_override)
--   awarded_at            — when the award was recorded
--
-- Additive only — null on every open/legacy deal; the running app ignores them until Slice 9 wires
-- the accepted-quotation reactor.
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists awarded_quotation_id uuid,
  add column if not exists contracted_value     numeric,
  add column if not exists award_source         text,
  add column if not exists awarded_at           timestamptz;

-- @DOWN
alter table public.aura_crm_opportunities
  drop column if exists awarded_at,
  drop column if exists award_source,
  drop column if exists contracted_value,
  drop column if exists awarded_quotation_id;

-- ============================================================
-- AURA OS — migration 0176: opportunity Win Plan (§14 / G16 — C2)
-- ------------------------------------------------------------
-- S6/S7 record what is HAPPENING on a deal (commitments, decisions, risks). Nothing records
-- the PLAN: why the customer buys, why us, and how we intend to win. That is the Win Plan —
-- customer need, business outcome, decision criteria & process, pain/urgency, differentiation,
-- win strategy, competitive position, procurement path, success conditions.
--
--   win_plan — one jsonb document, because these are ten NARRATIVE fields edited together and
--              read together; none is a filter/report axis (unlike G4's flattened lead context,
--              which is sliced by sector and system). Nullable: no plan recorded is the honest
--              state of every existing deal, and §14 forbids making the plan mandatory for
--              small deals — coverage is derived per read against deal size, never stored.
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists win_plan jsonb;

-- @DOWN
alter table public.aura_crm_opportunities drop column if exists win_plan;

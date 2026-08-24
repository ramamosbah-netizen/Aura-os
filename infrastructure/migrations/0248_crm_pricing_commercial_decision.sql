-- ============================================================
-- AURA OS — migration 0248: pricing commercial decision (Slice 7)
-- ------------------------------------------------------------
-- The Pricing Workspace makes the commercial decision on a package pricing sheet:
--   Approved Estimate (cost, read-only) → Target Margin / Markup → Discount → Selling Price → Freeze.
--
-- The sheet already models revision history (version + parent_sheet_id) and the draft→frozen
-- lifecycle. What it could NOT represent was the DECISION itself as editable draft data — the method
-- (target_margin vs markup), the input percent, and any discount. Before Slice 7 that was baked into a
-- single Engine-B carrier line and only the resulting margin% survived, so the method and discount were
-- lost and a draft could not hold a not-yet-committed policy.
--
-- This adds ONE additive, nullable jsonb column holding the whole decision:
--   { baselineCost, estimateRevisionId, policy: {method,percent}|null, discount: {kind,value}|null,
--     figures: SellingFigures|null }
-- It is null for the older per-line pricing flow (quotation/tender sheets), which prices through
-- `lines` and is untouched. Additive only — no data migration, no behaviour change on read.
-- ============================================================

alter table public.aura_crm_pricing_sheets
  add column if not exists commercial_decision jsonb;

-- @DOWN
alter table public.aura_crm_pricing_sheets
  drop column if exists commercial_decision;

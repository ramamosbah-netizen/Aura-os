-- ============================================================
-- AURA OS — migration 0169: quotation pricing sheet
-- ------------------------------------------------------------
-- Each quotation revision keeps its own INTERNAL cost sheet — per-line unit
-- costs, index-aligned to `lines` — so margin can be derived against the quoted
-- sell price. Additive, nullable; revisions carry the sheet forward on revise.
-- ============================================================

alter table public.aura_crm_quotations
  add column if not exists pricing jsonb;

-- @DOWN
alter table public.aura_crm_quotations drop column if exists pricing;

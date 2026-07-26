-- ============================================================
-- AURA OS — migration 0193: opportunity execution type
-- ------------------------------------------------------------
-- The fork at the heart of the revenue lifecycle. Sales DISCOVERS the opportunity;
-- executionType decides where it goes: direct_sale → Quotation, or tender → Tender
-- Management → Award. Replaces the two-way `requires_tender` boolean (kept, derived,
-- for the reactor and older readers). Backfilled from it so nothing changes today:
-- requires_tender true → 'tender', false → 'direct_sale'.
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists execution_type text not null default 'tender';

update public.aura_crm_opportunities
  set execution_type = case when requires_tender then 'tender' else 'direct_sale' end
  where execution_type = 'tender';  -- only the freshly-defaulted rows

-- @DOWN
alter table public.aura_crm_opportunities
  drop column if exists execution_type;

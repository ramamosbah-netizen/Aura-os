-- ============================================================
-- AURA OS — migration 0192: commissioning time on a market item
-- ------------------------------------------------------------
-- Hanging a device and making it WORK are different jobs, and the second is the
-- one estimates forget. The Crew Library therefore carries commissioning hours
-- separately from install hours; the pricing workspace seeds labour with both.
-- ============================================================

alter table public.aura_crm_market_items
  add column if not exists commissioning_hours numeric(10,2);

-- @DOWN
alter table public.aura_crm_market_items
  drop column if exists commissioning_hours;

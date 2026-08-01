-- ============================================================
-- AURA OS — migration 0189: the Estimation Engine build-up on a quotation
-- ------------------------------------------------------------
-- The Pricing Workspace authors each line as a full cost build-up — materials,
-- labour (hours × crew), equipment, consumables, subcontract, and the overhead /
-- risk / warranty / contingency loadings — then takes a margin. The quote LINES are
-- generated from that, but the build-up itself is the source, so it is kept here to
-- reopen and re-edit. Without it, reopening a priced quote would show sell prices with
-- no way back to how they were reached.
--
-- jsonb like `lines` and `pricing` (0169): a small, bounded array read only with its
-- quotation, never filtered across records.
-- ============================================================

alter table public.aura_crm_quotations
  add column if not exists estimation jsonb;

-- @DOWN
alter table public.aura_crm_quotations
  drop column if exists estimation;

-- ============================================================
-- AURA OS — migration 0358: one purchase order per recommendation selection (SUP-14)
-- ------------------------------------------------------------
-- An award turns an approved recommendation into one purchase order per supplier. Nothing at the
-- database level said so, and "exactly once" is not a property application code can hold on its own:
-- two requests can both read `approved` before either writes, and both then raise a full set of
-- orders for the same decision. That is duplicated spend, against a supplier who is entitled to be
-- paid for both.
--
-- SUP-14 defends this three times over, and this is the last of the three because it is the only one
-- that cannot be reasoned around:
--
--   1. a transaction-scoped ADVISORY LOCK on the recommendation   serialises concurrent awards
--   2. a CONDITIONAL UPDATE approved → awarded                    decides, once, who won
--   3. THIS UNIQUE INDEX                                          makes a second order impossible
--
-- The first two are correct today. The third stays correct if somebody later writes a new award
-- path, forgets the lock, and never finds out — which is exactly the kind of mistake that surfaces
-- as a duplicate purchase order six months on rather than as a failing test.
--
-- It also gives an order a precise provenance: not merely "some recommendation raised this" but
-- WHICH SELECTION within it — which supplier's share of the decision this order is.
-- ============================================================

alter table public.aura_procurement_purchase_orders
  add column if not exists recommendation_selection_id uuid;

comment on column public.aura_procurement_purchase_orders.recommendation_selection_id is
  'The selection within the sourcing recommendation this order fulfils — one supplier''s share of the decision. NULL for an order raised outside sourcing.';

-- Partial, because an order raised OUTSIDE sourcing legitimately has no selection, and several of
-- those must not collide on NULL.
create unique index if not exists aura_po_one_per_recommendation_selection
  on public.aura_procurement_purchase_orders (tenant_id, recommendation_selection_id)
  where recommendation_selection_id is not null;

-- @DOWN
drop index if exists public.aura_po_one_per_recommendation_selection;
alter table public.aura_procurement_purchase_orders
  drop column if exists recommendation_selection_id;

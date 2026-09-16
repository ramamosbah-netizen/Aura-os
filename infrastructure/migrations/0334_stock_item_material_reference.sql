-- ============================================================
-- AURA OS — migration 0334: a stock item becomes a POSITION on a material.
-- ------------------------------------------------------------
-- 0333 separated what a thing IS from where it is. This is the first half of the other side of that
-- separation: an existing stock item can now say which material it holds.
--
-- ADDITIVE AND NULLABLE, AND DELIBERATELY NOT BACKFILLED. Every stock item that exists today was
-- created before there was a material master, so it carries a code and a name and no statement at
-- all about which catalogue material it is. Matching them up by code would be a guess — the same
-- code may have been typed for two different things, or the same thing under two codes — and a
-- guess written into a reference column is indistinguishable afterwards from a fact somebody
-- established.
--
-- So NULL here means exactly one thing: this position predates the material master and nobody has
-- said which material it holds. It is not a claim that the material is unknown in principle, and it
-- is not a claim that the position is wrong. Every read of this column must treat NULL as "not
-- stated" and never as "no material". Existing behaviour — on-hand, movements, the spares reference
-- resolver — is untouched and keeps working from `code` exactly as before.
--
-- The full inversion (quantity_on_hand and warehouse moving out to a position table keyed on
-- material) is NOT done here. It touches a table with a proven external consumer in Handover's
-- spares path, and doing it in the same change that introduces the master would make one
-- reviewable step into two unreviewable ones.
-- ============================================================

ALTER TABLE public.aura_inventory_stock_items
  ADD COLUMN IF NOT EXISTS material_id uuid;

-- "Every position holding this material" — the read that makes the master useful from the stock
-- side. Partial, because most rows carry no statement yet and an index over nulls prices a fact
-- that is not there.
CREATE INDEX IF NOT EXISTS idx_aura_inventory_stock_items_material
  ON public.aura_inventory_stock_items (tenant_id, material_id)
  WHERE material_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_inventory_stock_items_material;
ALTER TABLE public.aura_inventory_stock_items
  DROP COLUMN IF EXISTS material_id;

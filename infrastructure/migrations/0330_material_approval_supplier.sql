-- ============================================================
-- AURA OS — migration 0330: an approved material is approved for a KNOWN supplier.
-- ------------------------------------------------------------
-- The Material Approval Request is the canonical record of an approved material submittal
-- (ENG-04): the contractor proposes a product — manufacturer, supplier, specification — and the
-- consultant approves, approves as noted, or rejects it before anything is bought or fixed to the
-- building. The record was already sound: it carries the product, the reviewer, their comments,
-- the decision and a revision chain.
--
-- What it lacked was a canonical link to the supplier it is about. The procurement gate matched
-- `lower(mar.supplier) = lower(po.supplier_name)` — free text on both sides. Two suppliers sharing
-- a name match each other; one supplier typed three ways matches nothing; and a link that silently
-- misses is worse than no link, because the gate then reports a clean pass. It is the same defect a
-- free-text WBS code was on a delay event (0325) and a free-text drawing reference on a technical
-- query (0329), in the place where the consequence is a purchase order.
--
-- `supplier` stays, because requests raised before this migration have nothing else, and deleting
-- the only identifier a historical record has would destroy the link rather than improve it. New
-- requests carry the id, the gate prefers it, and the free text remains the weaker fallback.
-- ============================================================

ALTER TABLE public.aura_quality_material_approvals
  ADD COLUMN IF NOT EXISTS supplier_id text;

-- Partial: the overwhelming majority of historical rows have no id, and an index over their nulls
-- would be pages of nothing. The gate only ever looks this up when an id is present.
CREATE INDEX IF NOT EXISTS idx_quality_mar_supplier
  ON public.aura_quality_material_approvals (tenant_id, project_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS idx_quality_mar_supplier;
ALTER TABLE public.aura_quality_material_approvals
  DROP COLUMN IF EXISTS supplier_id;

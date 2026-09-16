-- ============================================================
-- AURA OS — migration 0337: an estimate and an agreed price are not the same number.
-- ------------------------------------------------------------
-- Slice 2 carried an approved requisition's lines onto the order it drafts, and the requisition's
-- ESTIMATED unit cost became the order line's unit price — because at that moment it is the only
-- figure anybody has stated. That is correct, and it is also a trap: the two figures now live in
-- the same column, and nothing on the row says which kind it is.
--
-- They mean different things and they come from different authorities:
--
--   ESTIMATE  what the requisitioner thought this would cost. An internal budget figure, stated by
--             the person asking for the material, binding on nobody.
--   AGREED    what the supplier will actually be paid. A commercial fact, and on the sourced route
--             it must come from the selected quotation's own lineage rather than being typed over
--             the estimate.
--
-- Left undistinguished, a provisional figure silently becomes a commitment the moment an order is
-- issued — and worse, when supplier selection arrives there would be no way to tell which lines
-- still carry a placeholder. `unit_price_basis` keeps them apart.
--
-- EXISTING ROWS ARE NOT BACKFILLED to either value. A line written before this column existed was
-- never told which kind of figure it holds, and deciding on its behalf would be exactly the
-- inference this wave keeps refusing. NULL means "this line predates the distinction", and readers
-- must treat it as unknown rather than as agreed.
-- ============================================================

ALTER TABLE public.aura_procurement_purchase_order_lines
  ADD COLUMN IF NOT EXISTS unit_price_basis text;

ALTER TABLE public.aura_procurement_purchase_order_lines
  DROP CONSTRAINT IF EXISTS aura_po_lines_price_basis;
ALTER TABLE public.aura_procurement_purchase_order_lines
  ADD CONSTRAINT aura_po_lines_price_basis CHECK (
    unit_price_basis IS NULL OR unit_price_basis IN ('estimate', 'agreed')
  );

-- "Which lines are still carrying a placeholder price?" — the buyer's own question before issuing
-- an order, and the one supplier selection will answer. Partial: only the unsettled ones matter.
CREATE INDEX IF NOT EXISTS idx_aura_po_lines_estimated_price
  ON public.aura_procurement_purchase_order_lines (tenant_id, po_id)
  WHERE unit_price_basis = 'estimate';

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_po_lines_estimated_price;
ALTER TABLE public.aura_procurement_purchase_order_lines
  DROP CONSTRAINT IF EXISTS aura_po_lines_price_basis;
ALTER TABLE public.aura_procurement_purchase_order_lines
  DROP COLUMN IF EXISTS unit_price_basis;

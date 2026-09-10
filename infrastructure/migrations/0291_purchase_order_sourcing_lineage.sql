-- ============================================================
-- AURA OS — migration 0291: PROC-GAP-03 — purchase orders carry their sourcing lineage
-- ------------------------------------------------------------
-- The sourcing chain is PR → RFQ → PO → GRN, but the middle link was missing: awarding an RFQ marked
-- the winning quote and closed the RFQ, and never created or linked a purchase order — and a PO had
-- no way to point back at the RFQ it was awarded from. "Where did this PO come from, and was it
-- competitively sourced?" was unanswerable from the row.
--
-- These two nullable columns close it: `rfq_id` (the RFQ this PO was awarded from) and `pr_id` (the
-- purchase request that RFQ answered). Both NULL for a PO raised directly with no competitive
-- sourcing, which stays valid — the columns record a provenance that exists, they do not require one.
--
-- Deliberately NOT foreign keys: procurement's PO already references its project by id + snapshot
-- rather than by join (see the table's own design), and the same applies here — an RFQ or PR may be
-- archived without orphaning the spend record that cites it. The lineage is a traceable address, and
-- the service that awards writes both ends of it.
-- ============================================================

ALTER TABLE public.aura_procurement_purchase_orders
  ADD COLUMN IF NOT EXISTS rfq_id uuid,
  ADD COLUMN IF NOT EXISTS pr_id uuid;

-- The read a buyer makes: every PO sourced from this RFQ (partial — most POs have no RFQ).
CREATE INDEX IF NOT EXISTS idx_aura_procurement_purchase_orders_rfq
  ON public.aura_procurement_purchase_orders (tenant_id, rfq_id)
  WHERE rfq_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_procurement_purchase_orders_rfq;
ALTER TABLE public.aura_procurement_purchase_orders
  DROP COLUMN IF EXISTS rfq_id,
  DROP COLUMN IF EXISTS pr_id;

-- ============================================================
-- AURA OS — migration 0338: a delivery note records WHICH materials arrived, and how many.
-- ------------------------------------------------------------
-- A goods receipt was a header with one scalar `received_quantity`, exactly as the order was before
-- 0336. So an order for twelve cameras and 250 metres of cable could only be receipted with a
-- single number that belonged to neither of them — and `BUY-05`'s defect followed inevitably:
-- receiving anything marked the whole order received, because there were no positions to settle
-- one at a time.
--
-- A receipt line answers ONE ORDER LINE. That is the whole design: `po_line_id` is required, not
-- optional, because a receipt against nothing is not a receipt. It is what makes "1 of 100 received,
-- 99 outstanding" a fact the system holds rather than a sentence somebody writes in a note.
--
-- ACCEPTED AND REJECTED ARE SEPARATE COLUMNS, AND ONLY ONE OF THEM IS PROGRESS.
--
-- A rejected quantity arrived, was inspected and was sent back. It is a real fact about the
-- delivery — the supplier did ship it, somebody did look at it, and the reason matters for the
-- supplier's record — but it is NOT progress against the order, because the material is still owed.
-- Counting it would close an order that still owes goods: the same false completion as before, in a
-- politer form. So they are stored apart and only `quantity_accepted` reduces what is outstanding.
--
-- A rejection with no reason records nothing anybody can act on, so the reason is required with it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_inventory_goods_receipt_lines (
  id                uuid PRIMARY KEY,
  tenant_id         text NOT NULL,
  company_id        text,
  grn_id            uuid NOT NULL
    REFERENCES public.aura_inventory_grns (id) ON DELETE CASCADE,
  line_no           integer NOT NULL,

  /**
   * The ORDER LINE this receipt answers. Required: a receipt against nothing settles nothing, and
   * the whole point of this table is that a delivery lands on a position somebody can close.
   *
   * Deliberately NOT a foreign key — Inventory references Procurement by id + snapshot and does not
   * join across the module boundary, the same rule the GRN's own `po_id` already follows. The
   * service that writes this resolves the reference.
   */
  po_line_id        uuid NOT NULL,

  -- What arrived and was kept. The only figure that reduces what the order still owes.
  quantity_accepted numeric(18,4) NOT NULL DEFAULT 0,
  -- What arrived and was sent back. A fact about the delivery, never progress against the order.
  quantity_rejected numeric(18,4) NOT NULL DEFAULT 0,
  rejection_reason  text,
  notes             text,

  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aura_grn_lines_line_no_unique UNIQUE (grn_id, line_no),
  CONSTRAINT aura_grn_lines_line_no CHECK (line_no > 0),
  CONSTRAINT aura_grn_lines_accepted CHECK (quantity_accepted >= 0),
  CONSTRAINT aura_grn_lines_rejected CHECK (quantity_rejected >= 0),
  -- A receipt line recording neither an acceptance nor a rejection is a row that says nothing
  -- happened, on a document whose only purpose is to say something did.
  CONSTRAINT aura_grn_lines_something_arrived CHECK (quantity_accepted + quantity_rejected > 0),
  -- A rejection nobody explained cannot be acted on, by the supplier or by anybody chasing it.
  CONSTRAINT aura_grn_lines_rejection_reason CHECK (
    quantity_rejected = 0 OR length(btrim(coalesce(rejection_reason, ''))) > 0
  )
);

-- The note's own lines, in order.
CREATE INDEX IF NOT EXISTS idx_aura_grn_lines_grn
  ON public.aura_inventory_goods_receipt_lines (tenant_id, grn_id, line_no);
-- "How much of this order line has arrived" — summed across every note, which is the read the
-- order's delivery position is computed from.
CREATE INDEX IF NOT EXISTS idx_aura_grn_lines_po_line
  ON public.aura_inventory_goods_receipt_lines (tenant_id, po_line_id);

ALTER TABLE public.aura_inventory_goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_inventory_goods_receipt_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_inventory_goods_receipt_lines;
CREATE POLICY tenant_isolation_policy ON public.aura_inventory_goods_receipt_lines
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_inventory_goods_receipt_lines TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_inventory_goods_receipt_lines;

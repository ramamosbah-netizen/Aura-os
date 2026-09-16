-- ============================================================
-- AURA OS — migration 0336: a purchase order buys MATERIALS, and says how it came to buy them.
-- ------------------------------------------------------------
-- A purchase order was a header with one scalar `value` and, since 0212, one optional BOQ quantity.
-- So "what did we actually order" had no answer, and every question downstream of it — receive part
-- of it, issue some of it to site, prove the thing installed is the thing approved — had no subject.
-- 0335 gave demand its lines; this gives the order its own.
--
-- The line carries the same two halves a requisition line does, for the same reasons: `material_id`
-- is the canonical identity and stays pointing at the master forever, while the code, name,
-- specification, make, model and unit are COPIED here when the line is authored. An order read two
-- years later shows what was bought as it was described then, and the identity is still followable.
--
-- ── HOW THIS LINE CAME TO BE BOUGHT, AND WHY ABSENCE IS NOT THE ANSWER ─────────────────────────
--
-- There are two lawful routes to a purchase order line, and the direct one is not a loophole:
--
--   SOURCED   PR line → RFQ → supplier quote line → selection → PO line
--   DIRECT    material master → PO line, with no competitive sourcing
--
-- `source_type` states which, EXPLICITLY. That matters more than it looks, and it is the exact
-- inverse of the defect this wave has been closing elsewhere:
--
--   `source_pr_line_id IS NULL` does NOT mean "lineage unknown". Where `source_type = 'direct'` it
--   is explicit lineage — somebody decided to buy this without sourcing it, and that decision is
--   recorded rather than inferred from a missing column. Absence is meaningful ONLY because a
--   discriminator gives it meaning.
--
--   And the combination that would be an unfounded claim is refused: a line saying `sourced` with
--   no source chain behind it is rejected, not quietly accepted. A claim to have been competitively
--   sourced is exactly the claim nobody should be able to make by leaving a field empty.
--
-- THE THIRD STATE — legacy/unknown — is carried by the ABSENCE OF LINES, not by a line. Every
-- purchase order raised before this migration has a header value and no lines at all: it is valid,
-- it keeps behaving as it did, and it is never read as evidence that it was sourced or that it was
-- direct, because it predates the authority that could have said either. It is not selectable,
-- because it is not a choice anybody makes — it is what history looks like from here.
--
-- `source_quote_line_id` is declared now and unused: supplier quote lines and selection arrive in a
-- later slice, and when they do a `sourced` line will cite the exact quote line it answers. Until
-- that exists, `sourced` cannot be satisfied and is therefore refused — the column is a reservation
-- with a rule already attached, not a field waiting to be filled in by hand.
--
-- MONEY. `unit_price` is in the ORDER's currency, which lives on the header (one order, one
-- supplier, one currency). Normalisation across currencies — rate, rate date and provenance — is
-- the supplier-comparison slice's job, where quotations in different currencies actually meet.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_procurement_purchase_order_lines (
  id                  uuid PRIMARY KEY,
  tenant_id           text NOT NULL,
  company_id          text,
  po_id               uuid NOT NULL
    REFERENCES public.aura_procurement_purchase_orders (id) ON DELETE CASCADE,
  line_no             integer NOT NULL,

  -- ── Identity by reference, description by value ─────────────────────────────
  material_id         uuid NOT NULL,
  material_code       text NOT NULL,
  material_name       text NOT NULL,
  specification       text,
  manufacturer        text,
  model               text,
  -- Copied from the master. An order cannot invent a unit the material is not counted in.
  uom                 text NOT NULL,

  -- ── What is being bought ────────────────────────────────────────────────────
  quantity            numeric(18,4) NOT NULL,
  unit_price          numeric(18,4) NOT NULL,

  -- ── How this line came to be bought ─────────────────────────────────────────
  source_type         text NOT NULL,
  /** The demand this line answers. Optional on a direct line; REQUIRED on a sourced one. */
  source_pr_line_id   uuid,
  /** Reserved: the exact supplier quote line a selection chose. Slice 3/4. */
  source_quote_line_id uuid,

  -- ── Where the spend belongs ─────────────────────────────────────────────────
  wbs_node_id         text,
  cbs_node_id         text,
  notes               text,

  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aura_po_lines_line_no_unique UNIQUE (po_id, line_no),
  CONSTRAINT aura_po_lines_line_no CHECK (line_no > 0),
  CONSTRAINT aura_po_lines_quantity CHECK (quantity > 0),
  -- A price of zero is a real commercial fact (a free-issue item, a replacement under warranty).
  -- A negative one is a credit, which is not a purchase order line.
  CONSTRAINT aura_po_lines_unit_price CHECK (unit_price >= 0),
  CONSTRAINT aura_po_lines_code CHECK (length(btrim(material_code)) > 0),
  CONSTRAINT aura_po_lines_name CHECK (length(btrim(material_name)) > 0),
  CONSTRAINT aura_po_lines_uom  CHECK (length(btrim(uom))  > 0),
  -- `legacy` is deliberately NOT here: it is the state of an order with no lines, and a line that
  -- exists can always say which of the two routes produced it.
  CONSTRAINT aura_po_lines_source_type CHECK (source_type IN ('direct', 'sourced')),
  -- The database says the same thing the domain says: a claim to have been sourced needs the chain.
  CONSTRAINT aura_po_lines_sourced_needs_chain CHECK (
    source_type <> 'sourced' OR source_pr_line_id IS NOT NULL
  )
);

-- The order's own lines, in order — what every screen and every receipt reads.
CREATE INDEX IF NOT EXISTS idx_aura_po_lines_po
  ON public.aura_procurement_purchase_order_lines (tenant_id, po_id, line_no);
-- "What has been ORDERED of this material" — across orders, which is what makes exposure by
-- material answerable rather than by supplier name.
CREATE INDEX IF NOT EXISTS idx_aura_po_lines_material
  ON public.aura_procurement_purchase_order_lines (tenant_id, material_id);
-- "Was this demand ever bought?" — the requisition-side read of the same lineage. Partial, because
-- a direct line legitimately answers no requisition and an index over nulls prices an absent fact.
CREATE INDEX IF NOT EXISTS idx_aura_po_lines_source_pr_line
  ON public.aura_procurement_purchase_order_lines (tenant_id, source_pr_line_id)
  WHERE source_pr_line_id IS NOT NULL;

ALTER TABLE public.aura_procurement_purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_purchase_order_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_purchase_order_lines;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_purchase_order_lines
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_purchase_order_lines TO aura_app;

-- The order's transaction currency. One order is placed with one supplier in one currency, so it
-- belongs on the header rather than repeated per line. Defaulted from nothing and left NULL on
-- existing rows on purpose: a historical order was never told what currency it was in, and writing
-- one in now would be inventing a commercial fact rather than recording one. Readers treat NULL as
-- "the company's base currency", which is what those orders were always implicitly read as.
ALTER TABLE public.aura_procurement_purchase_orders
  ADD COLUMN IF NOT EXISTS currency text;

-- @DOWN
ALTER TABLE public.aura_procurement_purchase_orders DROP COLUMN IF EXISTS currency;
DROP TABLE IF EXISTS public.aura_procurement_purchase_order_lines;

-- ============================================================
-- AURA OS — migration 0335: a material requisition finally has materials on it.
-- ------------------------------------------------------------
-- BUY-01 is called "Material requisition lines" and there were no lines. Gap record J3-05 says it
-- exactly: the screen offers a title, a value and a project, with no material, quantity, unit,
-- specification, need-by date or cost code — and labels the money `$` while the company's own
-- record says AED. A requisition that cannot say WHAT is needed, HOW MUCH, or BY WHEN is a note
-- asking somebody to remember a conversation.
--
-- Demand starts here. A line authored on a requisition is the origin of the whole procurement
-- chain: PR line → RFQ → supplier quote line → selection → PO line → GRN line → stock → site issue.
-- Every later stage answers this line rather than re-typing it, which is what makes an item-level
-- supplier comparison possible at all — two vendors are comparable because they are quoting the
-- SAME line, not because somebody matched two descriptions by eye.
--
-- IDENTITY BY REFERENCE, DESCRIPTION BY VALUE. `material_id` is the canonical identity and stays
-- pointing at the master forever. The code, name, specification, manufacturer, model and unit are
-- COPIED here when the line is authored. Both halves are load-bearing and they do different jobs:
--
--   the reference answers "is the thing installed the thing that was approved and bought" — one
--   identity, followed end to end, never matched by description;
--
--   the copy answers "what did we think we were ordering, at the time we ordered it" — a
--   requisition read two years later shows the specification it was raised against, even though
--   the catalogue entry has been corrected since.
--
-- A reference alone would let a catalogue edit rewrite history. A copy alone is the free text this
-- whole wave exists to remove. Neither is sufficient; both together are.
--
-- NO CROSS-MODULE FOREIGN KEY on `material_id`, following the house rule this module already
-- states on its own tables: procurement references a project by id + snapshot and does not join
-- across a module boundary. The reference is resolved and validated by the service that writes it.
--
-- WHY THE ESTIMATED COST IS NOT OPTIONAL AT SUBMISSION. A requisition's value decides who is
-- allowed to approve it — `approvalMatrix.resolve(..., { value })` — so a line with no estimate
-- makes the total smaller, and a smaller total needs a less senior approver. Missing data would
-- quietly buy a weaker approval. That is the same defect this wave just closed on receipt, where an
-- absent quantity declared an order complete. A draft may be incomplete while somebody is still
-- working on it; a requisition asking for a decision may not.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_procurement_purchase_request_lines (
  id                  uuid PRIMARY KEY,
  tenant_id           text NOT NULL,
  company_id          text,
  pr_id               uuid NOT NULL
    REFERENCES public.aura_procurement_purchase_requests (id) ON DELETE CASCADE,
  -- Position on the requisition, so "line 3" means the same thing to everyone reading it.
  line_no             integer NOT NULL,

  -- ── Identity: the canonical material, by reference ──────────────────────────
  material_id         uuid NOT NULL,

  -- ── Snapshot: what that material was, when this line was authored ───────────
  material_code       text NOT NULL,
  material_name       text NOT NULL,
  specification       text,
  manufacturer        text,
  model               text,
  -- Copied from the master, never typed: a requisition cannot invent a unit the material is not
  -- counted in. Ten boxes of something measured in metres is not a quantity, it is a guess.
  uom                 text NOT NULL,

  -- ── The demand itself ───────────────────────────────────────────────────────
  quantity            numeric(18,4) NOT NULL,
  /**
   * WHEN it is needed on site. Freely allowed to be in the past: a requisition raised for something
   * that was needed last week is a real and common situation, and refusing the date would only make
   * somebody enter a false one.
   */
  need_by_date        date,
  /**
   * Internal budget estimate in the COMPANY'S BASE CURRENCY (aura_companies.base_currency). No
   * transaction currency and no FX here on purpose: a requisition is what we think we need, not
   * what a supplier has offered. Foreign currency and its rate provenance enter at the supplier
   * quotation, where there is an actual vendor price to preserve.
   */
  estimated_unit_cost numeric(18,4),

  -- ── Where the demand belongs ────────────────────────────────────────────────
  -- Canonical delivery/cost coding, each validated against the requisition's own project.
  wbs_node_id         text,
  cbs_node_id         text,
  notes               text,

  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aura_pr_lines_line_no_unique UNIQUE (pr_id, line_no),
  CONSTRAINT aura_pr_lines_line_no CHECK (line_no > 0),
  -- A demand for nothing is not a demand, and a negative one is a return.
  CONSTRAINT aura_pr_lines_quantity CHECK (quantity > 0),
  -- A cost may be absent (a draft still being written) but never negative or meaningless.
  CONSTRAINT aura_pr_lines_estimated_unit_cost CHECK (estimated_unit_cost IS NULL OR estimated_unit_cost >= 0),
  CONSTRAINT aura_pr_lines_code CHECK (length(btrim(material_code)) > 0),
  CONSTRAINT aura_pr_lines_name CHECK (length(btrim(material_name)) > 0),
  CONSTRAINT aura_pr_lines_uom  CHECK (length(btrim(uom))  > 0)
);

-- The requisition's own lines, in order — the read every screen and every downstream stage makes.
CREATE INDEX IF NOT EXISTS idx_aura_pr_lines_pr
  ON public.aura_procurement_purchase_request_lines (tenant_id, pr_id, line_no);
-- "What has been requisitioned for this material" — demand across requisitions, which is what makes
-- consolidating an RFQ possible later.
CREATE INDEX IF NOT EXISTS idx_aura_pr_lines_material
  ON public.aura_procurement_purchase_request_lines (tenant_id, material_id);

ALTER TABLE public.aura_procurement_purchase_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_purchase_request_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_purchase_request_lines;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_purchase_request_lines
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_purchase_request_lines TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_procurement_purchase_request_lines;

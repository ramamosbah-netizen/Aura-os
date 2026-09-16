-- ============================================================
-- AURA OS — migration 0333: the material master — WHAT a thing is, separated from WHERE it is.
-- ------------------------------------------------------------
-- Wave 4 asks eleven questions that all need one thing first: technical compliance, deviations,
-- make and model, quantity and unit, unit price, currency, tax, freight, lead time, payment terms,
-- warranty and validity are every one of them a fact ABOUT AN ITEM. Procurement had no items. A
-- purchase request was a title and a number, a purchase order was a title and a number, and a
-- supplier quotation was one aggregate amount per vendor, so "compare these two offers for THIS
-- material" had no subject.
--
-- The nearest thing that existed is `aura_inventory_stock_items`, and migration 0304 already says
-- out loud that "the authority for a part is Inventory". That authority is kept — this is not a new
-- neutral owner invented for tidiness. What is separated is the confusion inside that one row:
--
--   aura_inventory_stock_items = code, name, unit, WAREHOUSE, QUANTITY_ON_HAND
--
-- Identity and position in the same record. So a material that has never been stocked has nowhere
-- to exist, a material bought for direct delivery to site never appears, and `unique (tenant_id,
-- code)` means one item cannot be held in two warehouses. A requisition cannot name something that
-- only exists once somebody has put it in a warehouse.
--
-- MATERIAL MASTER ≠ STOCK POSITION. This table is what the thing IS: its code, its name, what it is
-- made of and by whom, and the unit its quantities are counted in. Stock positions, suppliers,
-- material approvals and projects all point AT a material and add their own facts; none of them is
-- part of its identity. That independence is what makes Wave 5's hardest question answerable — is
-- the material installed actually the material and model that was approved, purchased and received?
--
-- WHAT IS IMMUTABLE, AND WHY IT IS NOT MERE STRICTNESS
--
--   `code` — the identity a human transacts on. People type the code from a shelf label, never a
--   UUID (the same reason the stock reference resolver matches on code). Re-pointing a code at a
--   different material silently rewrites what every person who typed it meant.
--
--   `uom` — the unit is what a quantity MEANS. Change 'm' to 'roll' and every on-hand balance and
--   open demand for this material is reinterpreted without anyone editing a number. A material
--   measured differently is a different material.
--
-- Everything else — name, specification, manufacturer, model — is editable, because the commercial
-- documents that cite a material snapshot these BY VALUE at the moment they cite it. Correcting a
-- catalogue entry tomorrow must not rewrite what an order meant last year, and it cannot: the order
-- kept its own copy.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_inventory_materials (
  id             uuid PRIMARY KEY,
  tenant_id      text NOT NULL,
  company_id     text,
  -- The human identity. Immutable, unique per tenant; see the header.
  code           text NOT NULL,
  name           text NOT NULL,
  /**
   * What distinguishes this from another material with the same name — the free technical text a
   * specification or a datasheet gives. Nullable: a generic item legitimately has none.
   */
  specification  text,
  -- SUP-03 asks a supplier to state make and model. A master may name them (a specific approved
  -- product) or leave them open (a generic material several products can satisfy).
  manufacturer   text,
  model          text,
  -- Immutable. The unit every quantity of this material is counted in.
  uom            text NOT NULL,
  /**
   * `active` may be newly requisitioned. `obsolete` may not — but every document that already cites
   * it stays valid and readable, because retirement is a statement about future demand, not a claim
   * that the past did not happen.
   */
  status         text NOT NULL DEFAULT 'active',
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_inventory_materials_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT aura_inventory_materials_code CHECK (length(btrim(code)) > 0),
  CONSTRAINT aura_inventory_materials_name CHECK (length(btrim(name)) > 0),
  CONSTRAINT aura_inventory_materials_uom  CHECK (length(btrim(uom))  > 0),
  CONSTRAINT aura_inventory_materials_status CHECK (status IN ('active', 'obsolete'))
);

-- The read a requisitioner makes: the tenant's usable catalogue, by code.
CREATE INDEX IF NOT EXISTS idx_aura_inventory_materials_tenant
  ON public.aura_inventory_materials (tenant_id, status, code);

-- ENABLE and FORCE, because FORCE is what binds a non-superuser owner; without it an
-- owner-connected proof passes vacuously.
ALTER TABLE public.aura_inventory_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_inventory_materials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_inventory_materials;
CREATE POLICY tenant_isolation_policy ON public.aura_inventory_materials
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON public.aura_inventory_materials TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_inventory_materials;

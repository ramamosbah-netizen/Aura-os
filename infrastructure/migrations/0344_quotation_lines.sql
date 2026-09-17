-- Wave 4 — a supplier quotation says WHAT IT IS OFFERING, item by item.
--
-- A quotation was one scalar `amount`. So the twelve supplier-comparison leaves SUP-01…SUP-12 were
-- not merely unbuilt, they were STRUCTURALLY IMPOSSIBLE: technical compliance, deviations, make and
-- model, item quantity and unit, unit price, lead time and warranty had nowhere to exist. And the
-- award recommendation compared those scalars directly — `lowest amount wins` — which ranks an offer
-- excluding freight and VAT at twelve weeks above one including both at two.
--
-- This is the fourth appearance of one defect in this wave: a header with a scalar where the
-- business needs items. Requisition lines (0335) fixed it for demand, purchase order lines (0336)
-- for commitment, receipt lines (0338) for delivery. This fixes it for the supplier's offer.
--
-- THE GRAIN IS THE REQUISITION LINE. `pr_line_id` is REQUIRED: a quotation line exists to answer a
-- specific thing that was asked for, and an offer answering nothing cannot be compared with anything.
-- One answer per requisition line per quotation, enforced by a unique constraint — two prices for
-- one requirement from one supplier is not a richer offer, it is an ambiguity nobody can resolve.
--
-- SILENCE AND REFUSAL ARE DIFFERENT FACTS. A supplier who declines a line records `no_bid`. A
-- supplier who simply did not answer it has NO ROW, which is UNKNOWN. Collapsing the two would turn
-- "we asked and they said no" into "we never found out", or worse the reverse.
--
-- WHAT THIS TABLE IS, AND WHAT IT IS NOT.
--
--   It is the SUPPLIER'S DECLARATION. Everything here is what the supplier asserts: the make and
--   model offered, whether they claim to comply, what they have deviated from or excluded, their
--   price, their lead time, their warranty.
--
--   It is NOT a technical verdict. There is deliberately no `is_compliant` column. SUP-01's frozen
--   authority is the Procurement RFQ context with the Technical Manager among its roles — an
--   INTERNAL determination, made later, recorded beside this row and never inside it. A supplier
--   writing "compliant" is a claim exactly as a supplier writing a price is a claim. Quality's MAR
--   is evidence a technical evaluator may consult — it says a make/model is approved for the project
--   — and it is NOT this verdict: the same approved model can be offered with a deviation, a missing
--   accessory or a narrower warranty, and be approved and non-compliant at once.
--
--   It is NOT a comparable value. No normalised total, no landed cost, no rank. Those are derived
--   from these facts plus the Finance FX authority, and a stored one would be a second commercial
--   truth free to drift from the supplier's own.
--
-- SUPPLIER AND RFQ ARE REACHED RELATIONALLY through `quotation_id`. They are canonical and
-- unambiguous on the header, so duplicating them here would create two places for one fact with no
-- integrity need to justify it.

create table if not exists public.aura_procurement_quotation_lines (
  id                    uuid PRIMARY KEY,
  tenant_id             text NOT NULL,
  company_id            text,
  quotation_id          uuid NOT NULL
    REFERENCES public.aura_procurement_rfq_quotes(id) ON DELETE CASCADE,
  -- The requisition line this answers. Required: see THE GRAIN above.
  pr_line_id            uuid NOT NULL,

  -- 'quoted' | 'no_bid'. An omitted line has no row at all and is UNKNOWN.
  response              text NOT NULL DEFAULT 'quoted',

  -- ── The supplier's technical declaration (SUP-02, SUP-03) ──────────────────
  offered_manufacturer  text,
  offered_model         text,
  -- The supplier says this differs from what was asked for. An alternate is a DIFFERENT THING being
  -- offered, not an equivalent — it never becomes an equivalent by being flagged here.
  is_alternate          boolean NOT NULL DEFAULT false,
  -- The supplier's own answer to the specification: a CLAIM, never an eligibility.
  compliance_response   text,
  deviations            text,
  exclusions            text,

  -- ── The supplier's commercial facts, as given (SUP-04, SUP-05, SUP-09, SUP-11) ──
  quantity              numeric(18,4),
  uom                   text,
  -- In the QUOTATION's currency (0343). Never converted here.
  unit_price            numeric(18,4),
  line_discount         numeric(18,4),
  lead_time_days        integer,
  warranty_months       integer,

  notes                 text,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aura_quotation_lines_response
    CHECK (response IN ('quoted','no_bid')),
  CONSTRAINT aura_quotation_lines_compliance_response
    CHECK (compliance_response IS NULL
           OR compliance_response IN ('comply','comply_with_deviation','not_offered')),
  -- A priced offer must actually be an offer. A `quoted` line with no quantity or no price is not a
  -- richer quotation, it is an unanswerable one — the supplier declines with `no_bid` instead.
  CONSTRAINT aura_quotation_lines_quoted_is_priced
    CHECK (response <> 'quoted' OR (quantity IS NOT NULL AND quantity > 0 AND unit_price IS NOT NULL)),
  -- One answer per requirement per quotation.
  CONSTRAINT aura_quotation_lines_one_per_requirement
    UNIQUE (tenant_id, quotation_id, pr_line_id)
);

create index if not exists idx_aura_quotation_lines_quotation
  on public.aura_procurement_quotation_lines (tenant_id, quotation_id);
-- The comparison reads ACROSS suppliers for one requirement, so this is the index it needs.
create index if not exists idx_aura_quotation_lines_pr_line
  on public.aura_procurement_quotation_lines (tenant_id, pr_line_id);

ALTER TABLE public.aura_procurement_quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_quotation_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_quotation_lines;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_quotation_lines
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_quotation_lines TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_procurement_quotation_lines;

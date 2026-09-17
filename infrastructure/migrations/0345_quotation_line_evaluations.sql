-- SUP-01 — the INTERNAL technical determination on a supplier's offer.
--
-- The quotation line (0344) records what the SUPPLIER SAYS: the make and model offered, whether they
-- claim to comply, what they deviated from or excluded. It deliberately carries no verdict, because a
-- supplier writing "compliant" is a claim with exactly the standing of their price.
--
-- This is the verdict, and it is a different authority. `SUP-01`'s frozen authority is the Procurement
-- RFQ context with the Technical Manager among its roles, and only `r-technical-manager` holds the
-- `engineering.*` the determination is governed by — the Buyer records offers and does not decide
-- compliance. That separation is the point rather than a side effect: the role catalogue already says
-- of the Technical Manager that "the engineer who proposed the product must not be the one who
-- approves it".
--
-- QUALITY'S MAR IS A SEPARATE AUTHORITY AND IS NOT CONSUMED HERE. A MAR says a make/model is approved
-- for the project. It cannot answer whether THIS offer meets THIS requisition line's requirements,
-- because the same approved model can be offered with a deviation, a missing accessory or a narrower
-- warranty — and so be approved and non-compliant at once. Nothing on this path reads a MAR, so it is
-- not evidence this capability uses. Whether an approved MAR is even required for a given material is
-- UNDETERMINED and deliberately not assumed: some materials may need none, and making one a general
-- purchasing precondition would be inventing policy rather than reconciling an authority.
--
-- A RATIONALE IS REQUIRED. A verdict nobody explained cannot be reviewed, appealed or relied on, and
-- "non-compliant" with no reason gives a buyer nothing to put to the supplier. This is the same rule
-- that makes a rejected receipt quantity cost a reason (0338).
--
-- AMENDED BY SUPERSESSION, NEVER OVERWRITTEN. A technical verdict that can be silently edited is not
-- a decision, it is a mutable opinion — and the record of who decided what, when, is exactly what an
-- audit needs. The shape follows the house pattern already used for a tender go/no-go decision
-- (`aura_tendering_bid_scores`): the superseding row names what it replaced and why, and the replaced
-- row is marked rather than deleted.
--
-- ONE CURRENT VERDICT PER OFFER, enforced by a partial unique index over the un-superseded rows.

create table if not exists public.aura_procurement_quotation_line_evaluations (
  id                  uuid PRIMARY KEY,
  tenant_id           text NOT NULL,
  company_id          text,
  quotation_line_id   uuid NOT NULL
    REFERENCES public.aura_procurement_quotation_lines(id) ON DELETE CASCADE,

  -- 'compliant' | 'compliant_with_deviation' | 'non_compliant'.
  -- There is no 'unknown': an un-evaluated offer has NO ROW, and that absence is what UNKNOWN means.
  -- A stored 'unknown' would be a decision recorded by somebody who made none.
  verdict             text NOT NULL,
  rationale           text NOT NULL,

  decided_by          text NOT NULL,
  decided_at          timestamptz NOT NULL DEFAULT now(),

  -- The governed amendment chain. NULL `superseded_at` is the current verdict.
  supersedes_id       uuid REFERENCES public.aura_procurement_quotation_line_evaluations(id),
  amendment_reason    text,
  superseded_at       timestamptz,
  superseded_by       uuid,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aura_quo_line_eval_verdict
    CHECK (verdict IN ('compliant','compliant_with_deviation','non_compliant')),
  CONSTRAINT aura_quo_line_eval_rationale_present
    CHECK (length(btrim(rationale)) > 0),
  -- An amendment must say why it replaced the previous decision.
  CONSTRAINT aura_quo_line_eval_amendment_reason
    CHECK (supersedes_id IS NULL OR length(btrim(coalesce(amendment_reason,''))) > 0)
);

-- One CURRENT verdict per offer; superseded ones stay for the audit trail.
create unique index if not exists aura_quo_line_eval_one_current
  on public.aura_procurement_quotation_line_evaluations (tenant_id, quotation_line_id)
  where superseded_at is null;

create index if not exists idx_aura_quo_line_eval_line
  on public.aura_procurement_quotation_line_evaluations (tenant_id, quotation_line_id);

ALTER TABLE public.aura_procurement_quotation_line_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_quotation_line_evaluations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_quotation_line_evaluations;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_quotation_line_evaluations
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_quotation_line_evaluations TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_procurement_quotation_line_evaluations;

-- ============================================================
-- AURA OS — migration 0353: the governed sourcing recommendation (SUP-13)
-- ------------------------------------------------------------
-- There has never been a recommendation. `lowestQuote` was a pure function nothing called, and the
-- word "recommendation" appeared only as copy on a screen. The award took a legacy quote id, marked
-- every other quote rejected and raised a purchase order from a single header number — consulting
-- neither the technical verdict nor any comparable value.
--
-- A RECOMMENDATION IS A HUMAN ACT, RECORDED. AURA assembles eligible offers, comparable values,
-- technical compliance, deviations, validity and terms; a Buyer decides. Choosing an offer that is
-- not the lowest governed total is legitimate and common — single-source coordination, delivery,
-- warranty, project risk — and is recorded WITH ITS REASON rather than prevented.
--
-- IT NAMES THE REVISION IT WAS MADE ON. If a supplier sends Rev 3 after a recommendation was
-- prepared on Rev 2, the recommendation does NOT quietly become a recommendation of Rev 3: it
-- becomes STALE and must be reviewed. A decision that silently re-points at a different price is not
-- a decision anybody made.
--
-- MAKER AND CHECKER ARE DIFFERENT PEOPLE. The Buyer prepares and submits; the Procurement Manager
-- reviews, approves, rejects, returns or awards. Today the split exists only as an accident of route
-- permission derivation, which is not the same as being intended.
-- ============================================================

create table if not exists public.aura_procurement_sourcing_recommendations (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           text        not null,
  company_id          uuid,
  rfq_id              uuid        not null,
  -- The comparison this decision was made under. Carried so the recommendation can be re-read on its
  -- own terms: the same offers valued on a different date are a different decision.
  comparison_date     date        not null,
  comparison_currency text        not null,
  -- 'single_supplier' | 'split_award'. A split is an explicit act with a reason, never a side effect
  -- of one supplier happening to be cheaper on one line.
  mode                text        not null default 'single_supplier',
  status              text        not null default 'draft',
  /**
   * WHY THIS OFFER. Required when the chosen offer is not the lowest governed total, and required
   * for any split award. Free text beside a coded reason: the code makes it analysable, the text
   * makes it intelligible.
   */
  reason_code         text,
  reason              text,
  created_by          text,
  created_at          timestamptz not null default now(),
  submitted_by        text,
  submitted_at        timestamptz,
  decided_by          text,
  decided_at          timestamptz,
  decision_note       text,
  constraint aura_sourcing_reco_mode   check (mode in ('single_supplier','split_award')),
  constraint aura_sourcing_reco_status check (status in ('draft','submitted','approved','rejected','returned','awarded'))
);

-- One live recommendation per RFQ. A superseded one stays readable; two competing live ones would be
-- two answers to the same question.
create unique index if not exists aura_sourcing_reco_one_live
  on public.aura_procurement_sourcing_recommendations (tenant_id, rfq_id)
  where status in ('draft','submitted','approved');

create index if not exists idx_aura_sourcing_reco_rfq
  on public.aura_procurement_sourcing_recommendations (tenant_id, rfq_id, created_at desc);

create table if not exists public.aura_procurement_recommendation_selections (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            text        not null,
  recommendation_id    uuid        not null references public.aura_procurement_sourcing_recommendations (id) on delete cascade,
  -- WHICH offer, and WHICH revision of it. The revision is the point: a recommendation made on Rev 2
  -- stays a recommendation of Rev 2 when Rev 3 arrives.
  family_id            uuid        not null,
  offer_id             uuid        not null,
  revision_id          uuid        not null,
  supplier_name        text        not null,
  -- The requisition lines this supplier is being recommended for. A single-supplier recommendation
  -- covers all of them; a split award divides them, and the service refuses any overlap or omission.
  covered_pr_line_ids  uuid[]      not null default '{}',
  /**
   * The governed comparison value AT THE TIME OF THE DECISION, and the basis it was computed on.
   * Stored rather than re-derived: a recommendation is evidence of what was known when it was made,
   * and re-computing it later would quietly rewrite the decision's own basis. NULL is UNKNOWN and is
   * never a zero — an offer whose whole-requisition total could not be established is recorded as
   * such, which is exactly the case a partial offer creates.
   */
  governed_total       numeric(18,4),
  governed_total_basis text,
  technical_status     text,
  commercial_status    text,
  created_at           timestamptz not null default now(),
  constraint aura_reco_selection_one_offer unique (tenant_id, recommendation_id, offer_id)
);

create index if not exists idx_aura_reco_selections
  on public.aura_procurement_recommendation_selections (tenant_id, recommendation_id);

-- ── Tenant isolation, enforced by the database ─────────────────────────────
ALTER TABLE public.aura_procurement_sourcing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_sourcing_recommendations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_sourcing_recommendations;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_sourcing_recommendations
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_sourcing_recommendations TO aura_app;

ALTER TABLE public.aura_procurement_recommendation_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_recommendation_selections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_recommendation_selections;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_recommendation_selections
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_recommendation_selections TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_procurement_recommendation_selections;
DROP INDEX IF EXISTS public.idx_aura_sourcing_reco_rfq;
DROP INDEX IF EXISTS public.aura_sourcing_reco_one_live;
DROP TABLE IF EXISTS public.aura_procurement_sourcing_recommendations;

-- ============================================================
-- AURA OS — migration 0298: ITP linkage and Quality escalation seam (TC-GATE-3)
-- ------------------------------------------------------------
-- TWO SEAMS, NEITHER OF THEM A NEW AUTHORITY.
--
-- 1. aura_commissioning_itp_links
--
-- Quality owns the Inspection & Test Plan: `aura_quality_itps`, its hold/witness/review points, and
-- their results. T&C must SHOW the applicable requirements beside the system they apply to, and it
-- cannot, because the two sides do not share a vocabulary: an ITP carries a free-text `discipline`
-- (the UI's field is a plain text input) while a commissioning record carries the canonical
-- `ElvSystem` enum. Matching them by string would be a guess dressed as a fact, and a wrong guess
-- here shows an engineer the wrong acceptance criteria.
--
-- So the link is EXPLICIT and T&C-owned: a person says "this ITP applies to this system", and may
-- go further and say "this ITP point is proven by this commissioning test point". T&C writes only
-- this table; the ITP, its points and their results stay Quality's, read-only from here.
--
--   point_index NULL  → the whole ITP applies to the system
--   point_index set   → one requirement, optionally satisfied by test_item_id
--
-- 2. Escalation columns on aura_commissioning_punch_items
--
-- A commissioning defect sometimes needs a Quality non-conformance. T&C must not create one — that
-- is Quality's authority and its lifecycle. What T&C CAN own is the fact that it asked, and the
-- reference to the NCR a person then raised in Quality. `quality_ncr_id` is a reference, not a copy:
-- no NCR fields are duplicated here, so there is nothing to drift.
--
-- All columns nullable and additive. A defect that never needs Quality carries none of them.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_commissioning_itp_links (
  id               uuid        PRIMARY KEY,
  tenant_id        text        NOT NULL,
  company_id       text,
  commissioning_id uuid        NOT NULL,
  project_id       text        NOT NULL,
  /** The Quality ITP this system is measured against. Quality owns the row this points at. */
  itp_id           uuid        NOT NULL,
  /** Which point of it; NULL means the whole plan applies. */
  point_index      integer,
  /** The commissioning test point that proves this requirement, when one does. */
  test_item_id     uuid,
  linked_by        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_cx_itp_links_point_chk CHECK (point_index IS NULL OR point_index >= 0),
  -- One row per (system, ITP, point). Re-linking the same requirement is a no-op rather than a
  -- second row that would double-count the requirement in the readiness chain.
  CONSTRAINT aura_cx_itp_links_uq UNIQUE (commissioning_id, itp_id, point_index)
);

CREATE INDEX IF NOT EXISTS idx_cx_itp_links_record
  ON public.aura_commissioning_itp_links (tenant_id, commissioning_id);
CREATE INDEX IF NOT EXISTS idx_cx_itp_links_project
  ON public.aura_commissioning_itp_links (tenant_id, project_id);

ALTER TABLE public.aura_commissioning_itp_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_commissioning_itp_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.aura_commissioning_itp_links;
CREATE POLICY tenant_isolation ON public.aura_commissioning_itp_links
  FOR ALL
  USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

-- ── Quality escalation seam on the punch list ───────────────────────────────────────────────────

ALTER TABLE public.aura_commissioning_punch_items
  ADD COLUMN IF NOT EXISTS escalation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_by            text,
  ADD COLUMN IF NOT EXISTS quality_ncr_id          text;

COMMENT ON COLUMN public.aura_commissioning_punch_items.escalation_requested_at IS
  'When someone recorded that this defect needs a Quality non-conformance. T&C never raises one.';
COMMENT ON COLUMN public.aura_commissioning_punch_items.quality_ncr_id IS
  'Reference to the Quality NCR a person raised for this defect. A reference, never a copy.';

-- @DOWN
ALTER TABLE public.aura_commissioning_punch_items
  DROP COLUMN IF EXISTS quality_ncr_id,
  DROP COLUMN IF EXISTS escalated_by,
  DROP COLUMN IF EXISTS escalation_requested_at;
DROP TABLE IF EXISTS public.aura_commissioning_itp_links;

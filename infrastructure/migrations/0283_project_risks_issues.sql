-- ============================================================
-- AURA OS — migration 0283: §21 Project Risks & Issues
-- ------------------------------------------------------------
-- Two registers, two tables. A risk is an uncertain FUTURE event; an issue is a condition that
-- EXISTS NOW. One table with a `kind` column would carry likelihood, mitigation, resolution and
-- resolved_at all half-nullable per row and destroy both lifecycles.
--
-- WHAT IS SHARED WITH CRM, AND WHAT IS NOT. The severity ARITHMETIC is shared in code
-- (likelihood × impact → LOW/MEDIUM/HIGH/CRITICAL) and both registers compute it identically. The
-- LIFECYCLE is not: CRM's has no state for a risk that OCCURRED, because a deal risk that lands
-- ends the deal conversation. A delivery risk that lands becomes a live issue, so this table adds
-- MATERIALISED, and RESOLVED keeps its literal meaning — the exposure went away. Reporting a
-- failed forecast as a success is the one thing a risk register exists to prevent.
--
-- Storage is separate from aura_crm_opportunity_risks: widening its opportunity_id into
-- subject_type + subject_id would put Projects' data inside a CRM-owned table and make one
-- module's migration another module's outage.
--
-- ISSUE SEVERITY IS NOT RISK SEVERITY. Risk severity is the OUTPUT of a likelihood × impact
-- matrix; an issue has no likelihood, so it is graded minor/major/critical — the vocabulary this
-- system already uses for a problem that exists now (aura_quality_ncrs, commissioning punch items).
--
-- ON CHECK CONSTRAINTS. The rest of aura_projects_* stores status as free text with the values in
-- a comment, and 0282 argued against constraining a free-text vocabulary. These columns are
-- different on both counts: they are closed lifecycles the domain enforces, and these are new
-- tables with no historical rows a constraint could retroactively invalidate. The §2 status-writer
-- audit found writers reaching a lifecycle column outside the service that governs it; on a brand
-- new register the cheapest moment to make that impossible is now. `area` is left unconstrained
-- because it is a taxonomy that will grow.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.aura_projects_projects(id),
  reference text,
  title text NOT NULL,
  description text,
  -- DESIGN | PROCUREMENT | SCHEDULE | COST | QUALITY | SAFETY | RESOURCE | CLIENT | AUTHORITY
  -- | SUBCONTRACTOR | INTERFACE | OTHER — named after the domain that would have to answer.
  area text NOT NULL DEFAULT 'OTHER',
  likelihood text NOT NULL DEFAULT 'medium',           -- low | medium | high
  impact text NOT NULL DEFAULT 'medium',               -- low | medium | high
  -- Derived from likelihood × impact by the domain, stored so queries and rollups do not each
  -- reimplement the matrix. Never written independently of the two columns above.
  severity text NOT NULL DEFAULT 'MEDIUM',
  mitigation text,
  -- Why the exposure is being carried. Kept apart from `mitigation` because what was being done
  -- about a risk and why it was accepted instead are different statements, and one must not erase
  -- the other when acceptance is later revisited.
  acceptance_reason text,
  owner_name text,
  target_date date,
  -- OPEN | MITIGATING | ACCEPTED are live; RESOLVED and MATERIALISED are terminal and opposite.
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_projects_risks_status_check
    CHECK (status IN ('OPEN', 'MITIGATING', 'ACCEPTED', 'RESOLVED', 'MATERIALISED')),
  CONSTRAINT aura_projects_risks_severity_check
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT aura_projects_risks_likelihood_check CHECK (likelihood IN ('low', 'medium', 'high')),
  CONSTRAINT aura_projects_risks_impact_check CHECK (impact IN ('low', 'medium', 'high')),
  -- The lineage anchor. Not redundant with the primary key: it is the target of the composite
  -- foreign key on the issues table, which is what lets the DATABASE refuse provenance that
  -- crosses a project or a tenant. Same shape as uq_pre_award_pkg_tenant_id in 0244.
  CONSTRAINT uq_aura_projects_risks_lineage UNIQUE (tenant_id, project_id, id)
);

-- Deliberately NO `linked_issue_id` column.
--
-- Provenance is stored exactly once, on the issue, as `origin_risk_id`. A pointer on both rows
-- would be two rows asserting one fact, and two rows that can disagree. What the risk row says is
-- `status = 'MATERIALISED'`, which is a different fact: what happened to this risk, not where the
-- issue came from.

CREATE TABLE IF NOT EXISTS public.aura_projects_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.aura_projects_projects(id),
  reference text,
  title text NOT NULL,
  description text,
  area text NOT NULL DEFAULT 'OTHER',
  severity text NOT NULL DEFAULT 'major',              -- minor | major | critical, DECLARED
  status text NOT NULL DEFAULT 'open',                 -- open | in_progress | resolved | withdrawn
  owner_name text,
  -- When the condition was OBSERVED, not when the row was typed. NOT NULL because a nullable
  -- observation date makes "how long has this been live" unanswerable for most of the register —
  -- the gap PROC-GAP-05 records against goods receipts.
  raised_at timestamptz NOT NULL DEFAULT now(),
  raised_by text,
  due_date date,
  -- What actually ended it. The domain requires a note to reach either terminal state, because a
  -- resolution nobody had to write is indistinguishable from an issue somebody stopped looking at.
  resolution text,
  resolved_at timestamptz,
  resolved_by text,
  -- THE canonical provenance fact, and the only one.
  origin_risk_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_projects_issues_status_check
    CHECK (status IN ('open', 'in_progress', 'resolved', 'withdrawn')),
  CONSTRAINT aura_projects_issues_severity_check
    CHECK (severity IN ('minor', 'major', 'critical')),
  -- A risk materialises AT MOST ONCE. Multiple NULLs are permitted by a unique index, so issues
  -- raised directly — most of them — are unconstrained.
  CONSTRAINT uq_aura_projects_issues_origin_risk UNIQUE (origin_risk_id),
  -- COMPOUND FK: an issue's origin risk MUST belong to the SAME tenant and the SAME project
  -- (DB-enforced, not just application-enforced) — the pattern 0244 uses for estimate lineage.
  -- MATCH SIMPLE means the check is skipped entirely when origin_risk_id IS NULL, which is exactly
  -- right: an issue with no origin risk is unconstrained, one with an origin cannot cross a
  -- boundary even if a future writer forgets to check.
  CONSTRAINT aura_projects_issues_origin_lineage_fkey
    FOREIGN KEY (tenant_id, project_id, origin_risk_id)
    REFERENCES public.aura_projects_risks (tenant_id, project_id, id)
);

-- REFERENCE, never OWNERSHIP — and never "referential integrity".
--
-- An issue may point at an NCR, an RFI or a PO; it never absorbs them, and resolving the issue
-- leaves every record here exactly as it was. This table stores an ADDRESS and a label and nothing
-- else — no status, no due date, no copy of the target's fields. Anything more would be a second,
-- staler copy of a record another module owns, which is what §28 exists to prevent.
--
-- There is NO foreign key to the target and there cannot be one: it lives in another module's
-- table, and a database-level reference across that boundary would couple two modules' migrations.
-- The cost is that a row here can dangle, and nothing in §21 detects that. Verifying that these
-- still resolve is Lineage Referential Integrity's job. This table must never be described as
-- providing it.
CREATE TABLE IF NOT EXISTS public.aura_projects_issue_references (
  issue_id uuid NOT NULL REFERENCES public.aura_projects_issues(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  module text NOT NULL,
  record_type text NOT NULL,
  record_id text NOT NULL,
  label text,
  PRIMARY KEY (issue_id, module, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_aura_projects_risks_project
  ON public.aura_projects_risks (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_aura_projects_issues_project
  ON public.aura_projects_issues (tenant_id, project_id);
-- The "what is still live on this project" read, which is every dashboard on both registers.
CREATE INDEX IF NOT EXISTS idx_aura_projects_risks_open
  ON public.aura_projects_risks (tenant_id, project_id, status)
  WHERE status IN ('OPEN', 'MITIGATING', 'ACCEPTED');
CREATE INDEX IF NOT EXISTS idx_aura_projects_issues_open
  ON public.aura_projects_issues (tenant_id, project_id, status)
  WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_aura_projects_issue_references_issue
  ON public.aura_projects_issue_references (tenant_id, issue_id);

-- ── Row-level security ─────────────────────────────────────────────────────
-- ENABLE **and FORCE**. ENABLE alone does not apply a policy to the table's OWNER, so on any
-- connection that owns these tables — local development and the disposable e2e database both point
-- DATABASE_URL at the owning role — an ENABLE-only table has no isolation at all, and an RLS proof
-- run from there would pass vacuously. Migration 0163 swept every pre-existing aura_* table with a
-- tenant_id through ENABLE + FORCE; tables created after it must say so themselves, as 0281 does.
--
-- The policy body is the hierarchical one from 0049 that every aura_projects_* sub-table carries:
-- tenant first, then the branch/company/project narrowing taken from the parent project row.
--
-- aura_projects_eot_delay_links has no policy at all, which is a gap rather than a precedent — and
-- it has no tenant_id, so 0163's loop could not see it. The reference table below therefore gets a
-- policy through its parent issue, the way aura_document_versions does through its document.

ALTER TABLE public.aura_projects_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_risks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_risks;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_risks
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.aura_projects_projects p
      WHERE p.id = project_id
        AND (public.current_project_id() IS NULL OR p.id = public.current_project_id()::uuid)
        AND (public.current_branch_id() IS NULL OR p.branch_id = public.current_branch_id())
        AND (public.current_company_id() IS NULL OR p.company_id = public.current_company_id())
    )
  );

ALTER TABLE public.aura_projects_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_issues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_issues;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_issues
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.aura_projects_projects p
      WHERE p.id = project_id
        AND (public.current_project_id() IS NULL OR p.id = public.current_project_id()::uuid)
        AND (public.current_branch_id() IS NULL OR p.branch_id = public.current_branch_id())
        AND (public.current_company_id() IS NULL OR p.company_id = public.current_company_id())
    )
  );

ALTER TABLE public.aura_projects_issue_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_issue_references FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_issue_references;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_issue_references
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.aura_projects_issues i
      JOIN public.aura_projects_projects p ON p.id = i.project_id
      WHERE i.id = issue_id
        AND (public.current_project_id() IS NULL OR p.id = public.current_project_id()::uuid)
        AND (public.current_branch_id() IS NULL OR p.branch_id = public.current_branch_id())
        AND (public.current_company_id() IS NULL OR p.company_id = public.current_company_id())
    )
  );

-- The runtime role needs table privileges; RLS narrows what it may touch, it does not grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_risks TO aura_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_issues TO aura_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_issue_references TO aura_app;

-- @DOWN
-- Reversing this discards both registers. There is no honest partial rollback: the issues carry
-- resolutions and provenance that exist nowhere else, and a risk's MATERIALISED status is the only
-- record that its forecast came true. Dropped child-first so the foreign keys unwind cleanly.
DROP TABLE IF EXISTS public.aura_projects_issue_references;
DROP TABLE IF EXISTS public.aura_projects_issues;
DROP TABLE IF EXISTS public.aura_projects_risks;

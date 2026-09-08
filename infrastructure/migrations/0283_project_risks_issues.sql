-- ============================================================
-- AURA OS — migration 0283: §21 Project Risks & Issues
-- ------------------------------------------------------------
-- Two registers, two tables. A risk is an uncertain FUTURE event; an issue is a condition that
-- EXISTS NOW. One table with a `kind` column would carry likelihood, mitigation, resolution and
-- resolved_at all half-nullable per row, and would destroy both lifecycles — so they are separate
-- here for the same reason they are separate in the domain.
--
-- The risk table speaks the vocabulary CRM's aura_crm_opportunity_risks already speaks
-- (low/medium/high likelihood × impact → LOW/MEDIUM/HIGH/CRITICAL, OPEN/MITIGATING/RESOLVED/
-- ACCEPTED). It does NOT reuse that table: widening its opportunity_id into subject_type +
-- subject_id would put Projects' data inside a CRM-owned table and make one module's migration
-- another module's outage.
--
-- The issue table deliberately does not reuse the risk severity scale. That scale is the OUTPUT of
-- a likelihood × impact matrix and an issue has no likelihood, so it is graded minor/major/critical
-- — the vocabulary this system already uses for a problem that exists now (aura_quality_ncrs,
-- commissioning punch items).
--
-- ON CHECK CONSTRAINTS. The rest of aura_projects_* stores status as free text with the values in a
-- comment, and migration 0282 argued against constraining a free-text vocabulary. These two columns
-- are different on both counts: they are closed lifecycles the domain enforces, and these are new
-- tables with no historical rows a constraint could retroactively invalidate. The §2 status-writer
-- audit found writers reaching a lifecycle column outside the service that governs it; on a brand
-- new register with exactly one writer, the cheapest moment to make that impossible is now.
-- `area` is left unconstrained because it is a taxonomy that will grow.
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
  owner_name text,
  target_date date,
  status text NOT NULL DEFAULT 'OPEN',
  -- Set when this risk OCCURRED and was materialised into a live issue. Its presence is the only
  -- thing that distinguishes a risk that went away from one that landed — both read RESOLVED.
  linked_issue_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_projects_risks_status_check
    CHECK (status IN ('OPEN', 'MITIGATING', 'RESOLVED', 'ACCEPTED')),
  CONSTRAINT aura_projects_risks_severity_check
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT aura_projects_risks_likelihood_check CHECK (likelihood IN ('low', 'medium', 'high')),
  CONSTRAINT aura_projects_risks_impact_check CHECK (impact IN ('low', 'medium', 'high'))
);

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
  -- The risk this materialised from, when it came from the risk register.
  origin_risk_id uuid REFERENCES public.aura_projects_risks(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_projects_issues_status_check
    CHECK (status IN ('open', 'in_progress', 'resolved', 'withdrawn')),
  CONSTRAINT aura_projects_issues_severity_check
    CHECK (severity IN ('minor', 'major', 'critical'))
);

-- REFERENCE, never OWNERSHIP.
--
-- An issue may point at an NCR, an RFI or a PO; it never absorbs them, and resolving the issue
-- leaves every record here exactly as it was. This table therefore stores an ADDRESS and a label
-- and nothing else — no status, no due date, no copy of the target's fields. Anything more would
-- be a second, staler copy of a record another module owns, which is what §28 exists to prevent.
--
-- No foreign key, deliberately: the target lives in another module's table, and a database-level
-- reference across that boundary would couple two modules' migrations. A dangling pointer here is
-- recoverable; a cross-module FK is not.
CREATE TABLE IF NOT EXISTS public.aura_projects_issue_links (
  issue_id uuid NOT NULL REFERENCES public.aura_projects_issues(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  module text NOT NULL,
  record_type text NOT NULL,
  record_id text NOT NULL,
  label text,
  PRIMARY KEY (issue_id, module, record_type, record_id)
);

-- Added after both tables exist, because the reference runs the other way to origin_risk_id.
-- Dropped first so the file stays re-runnable, even though the runner applies each file once.
ALTER TABLE public.aura_projects_risks
  DROP CONSTRAINT IF EXISTS aura_projects_risks_linked_issue_fkey;
ALTER TABLE public.aura_projects_risks
  ADD CONSTRAINT aura_projects_risks_linked_issue_fkey
  FOREIGN KEY (linked_issue_id) REFERENCES public.aura_projects_issues(id);

CREATE INDEX IF NOT EXISTS idx_aura_projects_risks_project
  ON public.aura_projects_risks (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_aura_projects_issues_project
  ON public.aura_projects_issues (tenant_id, project_id);
-- The "what is still live on this project" read, which is every dashboard on both registers.
CREATE INDEX IF NOT EXISTS idx_aura_projects_risks_open
  ON public.aura_projects_risks (tenant_id, project_id, status)
  WHERE status IN ('OPEN', 'MITIGATING');
CREATE INDEX IF NOT EXISTS idx_aura_projects_issues_open
  ON public.aura_projects_issues (tenant_id, project_id, status)
  WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_aura_projects_issue_links_issue
  ON public.aura_projects_issue_links (tenant_id, issue_id);

-- ── Row-level security ─────────────────────────────────────────────────────
-- The hierarchical policy from 0049, which every aura_projects_* sub-table carries: tenant first,
-- then the branch/company/project narrowing taken from the parent project row.
--
-- aura_projects_eot_delay_links has no policy at all, which is a gap rather than a precedent, so
-- the link table below gets one through its parent issue.

ALTER TABLE public.aura_projects_risks ENABLE ROW LEVEL SECURITY;
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

ALTER TABLE public.aura_projects_issue_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_issue_links;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_issue_links
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

-- @DOWN
-- Reversing this discards both registers. There is no honest partial rollback: the issues carry
-- resolutions and provenance that exist nowhere else, and a risk's linked_issue_id is the only
-- record that its forecast came true. Dropping issues first would violate that foreign key, so the
-- constraint goes before the tables it spans.
ALTER TABLE IF EXISTS public.aura_projects_risks
  DROP CONSTRAINT IF EXISTS aura_projects_risks_linked_issue_fkey;
DROP TABLE IF EXISTS public.aura_projects_issue_links;
DROP TABLE IF EXISTS public.aura_projects_issues;
DROP TABLE IF EXISTS public.aura_projects_risks;

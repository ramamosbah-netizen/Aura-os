-- ============================================================
-- AURA OS kernel — migration 0049: dynamic hierarchical RLS
-- ------------------------------------------------------------
-- Adds branch_id to projects, creates branch/project claims
-- helpers, and attaches hierarchical isolation policies.
-- ============================================================

-- 1. Add branch_id column to aura_projects_projects
ALTER TABLE public.aura_projects_projects ADD COLUMN IF NOT EXISTS branch_id text;

-- 2. Define session setting helper functions for branch and project
CREATE OR REPLACE FUNCTION public.current_branch_id() RETURNS text AS $$
  SELECT coalesce(
    nullif(current_setting('app.current_branch_id', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'branch_id', '')
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.current_project_id() RETURNS text AS $$
  SELECT coalesce(
    nullif(current_setting('app.current_project_id', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'project_id', '')
  );
$$ LANGUAGE sql STABLE;

-- 3. Apply hierarchical policy to projects table
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_projects;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_projects;

ALTER TABLE public.aura_projects_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_projects
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      (public.current_project_id() IS NULL OR id = public.current_project_id()::uuid)
      AND (public.current_branch_id() IS NULL OR branch_id = public.current_branch_id())
      AND (public.current_company_id() IS NULL OR company_id = public.current_company_id())
    )
  );

-- 4. Apply hierarchical policy to project sub-tables (CBS, WBS, Delays, EOTs)
-- These tables link to projects via project_id

-- CBS Nodes
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_cbs_nodes;
DROP POLICY IF EXISTS cbs_tenant_isolation ON public.aura_projects_cbs_nodes;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_cbs_nodes;

ALTER TABLE public.aura_projects_cbs_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_cbs_nodes
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

-- WBS Nodes
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_wbs_nodes;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_wbs_nodes;

ALTER TABLE public.aura_projects_wbs_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_wbs_nodes
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

-- Delay Events
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_delay_events;
DROP POLICY IF EXISTS delay_tenant_isolation ON public.aura_projects_delay_events;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_delay_events;

ALTER TABLE public.aura_projects_delay_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_delay_events
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

-- EOT Claims
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_eot_claims;
DROP POLICY IF EXISTS eot_tenant_isolation ON public.aura_projects_eot_claims;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_eot_claims;

ALTER TABLE public.aura_projects_eot_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_eot_claims
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

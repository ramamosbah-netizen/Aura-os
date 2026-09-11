-- ============================================================
-- AURA OS — migration 0294: AURA-ORG-001 — remove the unmanaged `branch` RLS scope
-- ------------------------------------------------------------
-- Migration 0049 added `branch_id text` to aura_projects_projects and wove `current_branch_id()`
-- into the hierarchical RLS policy of every aura_projects_* table:
--
--     AND (current_branch_id() IS NULL OR p.branch_id = current_branch_id())
--
-- But `branch` is not part of this system's org model. The real tree is
-- tenant -> company -> business_unit -> department -> team (shared/src/identity/org.ts), with a
-- register and containment. `branch_id` is a bare text column belonging to nothing: no Branch table,
-- no ORG_LEVEL, no validation, and — searched across core, apps/api and modules — NO WRITER for the
-- GUC or the JWT claim `current_branch_id()` reads. On this codebase the predicate is inert (it is
-- written `IS NULL OR ...`), so it never bites; §22 already scopes resource pools to a real OrgNode
-- (DG-22.9) rather than to branch.
--
-- Inert AND unmanaged is the problem. The claim can still arrive from outside — a JWT minted by an
-- external IdP, or an operator setting the GUC — and nothing validates it. At that moment row
-- visibility across every aura_projects_* table turns on an unregistered string with nothing to
-- check it against: a typo silently narrows a user's world to nothing, and it is a filter no code
-- can enumerate, rename, or reason about. Promoting branch into the org model would be inventing a
-- concept nothing writes or reads; the honest fix is to remove it.
--
-- This recreates each of the 13 hierarchical policies WITHOUT the branch predicate — tenant, project
-- and company scoping are preserved exactly, byte-for-byte minus that one line — then drops the
-- now-unreferenced helper and column. `current_project_id()` is left untouched: it has the same
-- shape but names an aggregate that DOES exist and is a real scope.
-- ============================================================

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_projects;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_projects FOR ALL USING (((tenant_id = current_tenant_id()) AND (((current_project_id() IS NULL) OR (id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (company_id = current_company_id())))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_cbs_nodes;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_cbs_nodes FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_cbs_nodes.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_wbs_nodes;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_wbs_nodes FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_wbs_nodes.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_delay_events;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_delay_events FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_delay_events.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_eot_claims;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_eot_claims FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_eot_claims.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_risks;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_risks FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_risks.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_issues;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_issues FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_issues.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_issue_references;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_issue_references FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM (aura_projects_issues i
     JOIN aura_projects_projects p ON ((p.id = i.project_id)))
  WHERE ((i.id = aura_projects_issue_references.issue_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_schedule_tasks;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_schedule_tasks FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_schedule_tasks.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_schedule_dependencies;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_schedule_dependencies FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_schedule_dependencies.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_task_requirements;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_task_requirements FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_task_requirements.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_resource_bookings;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_resource_bookings FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_resource_bookings.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_planning_runs;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_planning_runs FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_planning_runs.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

-- The helper and the column are now referenced by nothing (verified: no index, no other policy, no
-- other function). Drop without CASCADE so a missed dependency would fail loudly rather than silently
-- taking something with it.
DROP FUNCTION IF EXISTS public.current_branch_id();
ALTER TABLE public.aura_projects_projects DROP COLUMN IF EXISTS branch_id;

-- @DOWN
-- Restore branch exactly as 0049 left it: the column, the helper, then every policy with the branch
-- predicate back in place.
ALTER TABLE public.aura_projects_projects ADD COLUMN IF NOT EXISTS branch_id text;

CREATE OR REPLACE FUNCTION public.current_branch_id() RETURNS text AS $$
  SELECT coalesce(
    nullif(current_setting('app.current_branch_id', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'branch_id', '')
  );
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_projects;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_projects FOR ALL USING (((tenant_id = current_tenant_id()) AND (((current_project_id() IS NULL) OR (id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (company_id = current_company_id())))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_cbs_nodes;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_cbs_nodes FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_cbs_nodes.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_wbs_nodes;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_wbs_nodes FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_wbs_nodes.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_delay_events;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_delay_events FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_delay_events.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_eot_claims;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_eot_claims FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_eot_claims.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_risks;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_risks FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_risks.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_issues;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_issues FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_issues.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_issue_references;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_issue_references FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM (aura_projects_issues i
     JOIN aura_projects_projects p ON ((p.id = i.project_id)))
  WHERE ((i.id = aura_projects_issue_references.issue_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_schedule_tasks;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_schedule_tasks FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_schedule_tasks.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_schedule_dependencies;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_schedule_dependencies FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_schedule_dependencies.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_task_requirements;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_task_requirements FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_task_requirements.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_resource_bookings;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_resource_bookings FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_resource_bookings.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_planning_runs;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_planning_runs FOR ALL USING (((tenant_id = current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM aura_projects_projects p
  WHERE ((p.id = aura_projects_planning_runs.project_id) AND ((current_project_id() IS NULL) OR (p.id = (current_project_id())::uuid)) AND ((current_branch_id() IS NULL) OR (p.branch_id = current_branch_id())) AND ((current_company_id() IS NULL) OR (p.company_id = current_company_id())))))));

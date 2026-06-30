-- ============================================================
-- AURA OS — migration 0076: Quality Material Approval Requests (MAR)
-- ------------------------------------------------------------
-- The contractor submits a proposed material (manufacturer, spec,
-- supplier) for consultant approval before procurement/installation.
-- Lifecycle: draft → submitted → approved | approved_as_noted | rejected.
-- A rejected / approved-as-noted MAR can be revised (revision++).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_quality_material_approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  company_id      text,
  project_id      uuid NOT NULL,
  project_name    text,
  reference       text NOT NULL,
  material_name   text NOT NULL,
  manufacturer    text NOT NULL DEFAULT '',
  supplier        text NOT NULL DEFAULT '',
  specification   text NOT NULL DEFAULT '',
  discipline      text NOT NULL DEFAULT 'general',
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','approved_as_noted','rejected')),
  revision        integer NOT NULL DEFAULT 0,
  review_comments text NOT NULL DEFAULT '',
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quality_mar_tenant ON public.aura_quality_material_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quality_mar_project ON public.aura_quality_material_approvals(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_quality_mar_status ON public.aura_quality_material_approvals(tenant_id, status);

-- Tenant isolation (house pattern).
ALTER TABLE public.aura_quality_material_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_quality_material_approvals;
CREATE POLICY tenant_isolation_policy ON public.aura_quality_material_approvals
  FOR ALL USING (tenant_id = public.current_tenant_id());

-- Quality Inspection & Test Plans (ITP) — plan header + embedded inspection points (JSONB)
CREATE TABLE IF NOT EXISTS public.aura_quality_itps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  company_id   text,
  project_id   uuid NOT NULL,
  project_name text,
  reference    text NOT NULL,
  title        text NOT NULL,
  discipline   text NOT NULL DEFAULT 'general',
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
  points       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quality_itps_tenant ON public.aura_quality_itps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quality_itps_project ON public.aura_quality_itps(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_quality_itps_status ON public.aura_quality_itps(tenant_id, status);

-- DocControl document submittals — review register with Code A/B/C/D approval cycle
CREATE TABLE IF NOT EXISTS public.aura_doccontrol_submittals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        text NOT NULL,
  company_id       text,
  project_id       uuid NOT NULL,
  project_name     text,
  reference        text NOT NULL,
  title            text NOT NULL,
  discipline       text NOT NULL DEFAULT 'other' CHECK (discipline IN ('architectural','structural','mep','elv','civil','other')),
  revision         integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','returned')),
  review_code      text CHECK (review_code IN ('A','B','C','D')),
  review_comments  text NOT NULL DEFAULT '',
  submitted_at     timestamptz,
  returned_at      timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doccontrol_submittals_tenant ON public.aura_doccontrol_submittals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doccontrol_submittals_project ON public.aura_doccontrol_submittals(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_doccontrol_submittals_status ON public.aura_doccontrol_submittals(tenant_id, status);

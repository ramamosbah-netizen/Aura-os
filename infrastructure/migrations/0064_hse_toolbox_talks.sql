-- HSE toolbox talks — the daily pre-work safety briefing recorded on every UAE site
CREATE TABLE IF NOT EXISTS public.aura_hse_toolbox_talks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL,
  company_id     text,
  project_id     uuid NOT NULL,
  project_name   text,
  topic          text NOT NULL,
  conducted_by   text NOT NULL,
  talk_date      date NOT NULL,
  attendee_count integer NOT NULL CHECK (attendee_count >= 1),
  notes          text NOT NULL DEFAULT '',
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hse_toolbox_tenant ON public.aura_hse_toolbox_talks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hse_toolbox_project ON public.aura_hse_toolbox_talks(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_hse_toolbox_date ON public.aura_hse_toolbox_talks(tenant_id, talk_date);

-- HR timesheets — daily hour entries per employee, optionally linked to a project/WBS node
CREATE TABLE IF NOT EXISTS public.aura_hr_timesheets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  employee_id   uuid NOT NULL,
  project_id    uuid,
  wbs_node_id   uuid,
  date          date NOT NULL,
  hours         numeric(5,2) NOT NULL CHECK (hours >= 0 AND hours <= 24),
  overtime      numeric(5,2) NOT NULL DEFAULT 0 CHECK (overtime >= 0),
  description   text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  approved_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_hr_timesheets_tenant ON public.aura_hr_timesheets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_timesheets_employee ON public.aura_hr_timesheets(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_timesheets_date ON public.aura_hr_timesheets(tenant_id, employee_id, date);

-- ============================================================
-- AURA OS — migration 0075: HR attendance (daily presence)
-- ------------------------------------------------------------
-- One record per employee per day: check-in/out clock times, a
-- status, and worked hours derived from the times. Feeds payroll/
-- overtime and MoHRE compliance. (Timesheets log effort against
-- projects; attendance logs presence.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_hr_attendance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  company_id    text,
  employee_id   uuid NOT NULL,
  employee_name text NOT NULL DEFAULT 'Employee',
  date          date NOT NULL,
  check_in      text,
  check_out     text,
  status        text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','half_day','leave','holiday')),
  worked_hours  numeric(5,2) NOT NULL DEFAULT 0 CHECK (worked_hours >= 0),
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid
);

CREATE INDEX IF NOT EXISTS idx_hr_attendance_tenant ON public.aura_hr_attendance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_employee ON public.aura_hr_attendance(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_date ON public.aura_hr_attendance(tenant_id, date);

-- Tenant isolation (house pattern).
ALTER TABLE public.aura_hr_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_hr_attendance;
CREATE POLICY tenant_isolation_policy ON public.aura_hr_attendance
  FOR ALL USING (tenant_id = public.current_tenant_id());

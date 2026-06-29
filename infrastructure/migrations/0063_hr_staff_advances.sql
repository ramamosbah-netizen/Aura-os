-- HR staff advances / salary loans — borrowed against salary, repaid in installments
CREATE TABLE IF NOT EXISTS public.aura_hr_staff_advances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL,
  employee_id    uuid NOT NULL,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  reason         text NOT NULL DEFAULT '',
  installments   integer NOT NULL DEFAULT 1 CHECK (installments >= 1 AND installments <= 60),
  amount_repaid  numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_repaid >= 0),
  status         text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','disbursed','settled')),
  request_date   date NOT NULL,
  approved_by    uuid,
  disbursed_date date,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_staff_advances_tenant ON public.aura_hr_staff_advances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_staff_advances_employee ON public.aura_hr_staff_advances(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_staff_advances_status ON public.aura_hr_staff_advances(tenant_id, status);

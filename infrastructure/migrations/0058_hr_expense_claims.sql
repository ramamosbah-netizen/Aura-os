-- HR expense claims — employee reimbursement requests with an approval + payout workflow
CREATE TABLE IF NOT EXISTS public.aura_hr_expense_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  employee_id     uuid NOT NULL,
  project_id      uuid,
  category        text NOT NULL CHECK (category IN ('travel','accommodation','meals','fuel','materials','other')),
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  expense_date    date NOT NULL,
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','reimbursed')),
  approved_by     uuid,
  reimbursed_date date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_expense_claims_tenant ON public.aura_hr_expense_claims(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_expense_claims_employee ON public.aura_hr_expense_claims(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_expense_claims_status ON public.aura_hr_expense_claims(tenant_id, status);

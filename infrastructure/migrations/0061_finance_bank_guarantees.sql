-- Finance bank guarantees / bonds — tender, performance, advance-payment, retention instruments
CREATE TABLE IF NOT EXISTS public.aura_finance_bank_guarantees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  company_id   text,
  reference    text NOT NULL,
  type         text NOT NULL CHECK (type IN ('tender','performance','advance_payment','retention','other')),
  beneficiary  text NOT NULL,
  bank_name    text NOT NULL,
  project_id   uuid,
  project_name text,
  amount       numeric(16,2) NOT NULL CHECK (amount > 0),
  currency     text NOT NULL DEFAULT 'AED',
  issue_date   date NOT NULL,
  expiry_date  date NOT NULL,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','claimed','expired')),
  notes        text NOT NULL DEFAULT '',
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_guarantees_tenant ON public.aura_finance_bank_guarantees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_guarantees_status ON public.aura_finance_bank_guarantees(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_guarantees_expiry ON public.aura_finance_bank_guarantees(tenant_id, expiry_date);

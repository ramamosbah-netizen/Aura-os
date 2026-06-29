-- Finance petty cash — imprest cash floats and their top-up/expense movements
CREATE TABLE IF NOT EXISTS public.aura_finance_petty_cash_funds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             text NOT NULL,
  company_id            text,
  name                  text NOT NULL,
  custodian_employee_id uuid,
  balance               numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aura_finance_petty_cash_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        text NOT NULL,
  fund_id          uuid NOT NULL REFERENCES public.aura_finance_petty_cash_funds(id),
  type             text NOT NULL CHECK (type IN ('topup','expense')),
  category         text NOT NULL DEFAULT 'other' CHECK (category IN ('office','travel','fuel','materials','refreshments','other')),
  amount           numeric(14,2) NOT NULL CHECK (amount > 0),
  description      text NOT NULL DEFAULT '',
  balance_after    numeric(14,2) NOT NULL,
  transaction_date date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_funds_tenant ON public.aura_finance_petty_cash_funds(tenant_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_tx_fund ON public.aura_finance_petty_cash_transactions(fund_id);

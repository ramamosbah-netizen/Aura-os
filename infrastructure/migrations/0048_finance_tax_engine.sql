-- 0048: Finance — VAT/Tax Engine
-- Configurable tax codes and automatic tax line computation on invoices.

CREATE TABLE IF NOT EXISTS public.aura_finance_tax_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,             -- e.g. 'VAT-5', 'VAT-0', 'EXEMPT', 'RC'
  description text NOT NULL,      -- e.g. '5% Standard Rate VAT'
  rate numeric NOT NULL DEFAULT 0, -- e.g. 5.00 = 5%
  tax_type text NOT NULL DEFAULT 'output', -- 'output' | 'input' | 'reverse_charge'
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

ALTER TABLE public.aura_finance_tax_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_code_tenant ON public.aura_finance_tax_codes
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS public.aura_finance_tax_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.aura_finance_invoices(id),
  tax_code_id uuid NOT NULL REFERENCES public.aura_finance_tax_codes(id),
  taxable_amount numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  is_inclusive boolean NOT NULL DEFAULT false, -- tax-inclusive pricing
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_finance_tax_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_line_tenant ON public.aura_finance_tax_lines
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Tax return periods (quarterly VAT filing)
CREATE TABLE IF NOT EXISTS public.aura_finance_tax_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_output_tax numeric NOT NULL DEFAULT 0,
  total_input_tax numeric NOT NULL DEFAULT 0,
  net_tax_payable numeric GENERATED ALWAYS AS (total_output_tax - total_input_tax) STORED,
  status text NOT NULL DEFAULT 'draft', -- 'draft' | 'filed' | 'paid'
  filed_at timestamptz,
  filed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_finance_tax_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_return_tenant ON public.aura_finance_tax_returns
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Finance customer (AR / sales) invoices — tax invoices billed to clients, with receipt tracking
CREATE TABLE IF NOT EXISTS public.aura_finance_customer_invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL,
  company_id     text,
  invoice_number text NOT NULL,
  customer_name  text NOT NULL,
  project_id     uuid,
  project_name   text,
  contract_ref   text,
  issue_date     date NOT NULL,
  due_date       date,
  lines          jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal       numeric(14,2) NOT NULL DEFAULT 0,
  vat_total      numeric(14,2) NOT NULL DEFAULT 0,
  total          numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid    numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partially_paid','paid','cancelled')),
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_invoices_tenant ON public.aura_finance_customer_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_status ON public.aura_finance_customer_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_project ON public.aura_finance_customer_invoices(tenant_id, project_id);

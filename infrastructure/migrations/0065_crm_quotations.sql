-- CRM customer quotations — pre-sales quotes (line items + VAT) preceding contract/invoice
CREATE TABLE IF NOT EXISTS public.aura_crm_quotations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  company_id    text,
  quote_number  text NOT NULL,
  customer_name text NOT NULL,
  account_id    uuid,
  contact_name  text,
  issue_date    date NOT NULL,
  valid_until   date,
  lines         jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal      numeric(14,2) NOT NULL DEFAULT 0,
  vat_total     numeric(14,2) NOT NULL DEFAULT 0,
  total         numeric(14,2) NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_quotations_tenant ON public.aura_crm_quotations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_quotations_status ON public.aura_crm_quotations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_quotations_account ON public.aura_crm_quotations(tenant_id, account_id);

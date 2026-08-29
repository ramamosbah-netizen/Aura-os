-- Quotation workspace search/filter support. Keep tenant as the leading column so every index
-- remains tenant-safe and useful under RLS-style tenant predicates.
CREATE INDEX IF NOT EXISTS idx_crm_quotations_owner
  ON public.aura_crm_quotations (tenant_id, owner_id);

CREATE INDEX IF NOT EXISTS idx_crm_quotations_issue_date
  ON public.aura_crm_quotations (tenant_id, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_crm_quotations_quote_number
  ON public.aura_crm_quotations (tenant_id, quote_number);

-- @DOWN
DROP INDEX IF EXISTS public.idx_crm_quotations_owner;
DROP INDEX IF EXISTS public.idx_crm_quotations_issue_date;
DROP INDEX IF EXISTS public.idx_crm_quotations_quote_number;

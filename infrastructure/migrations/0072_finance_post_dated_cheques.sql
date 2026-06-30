-- ============================================================
-- AURA OS — migration 0072: Post-Dated Cheques (PDC) register
-- ------------------------------------------------------------
-- Cheques written today but dated for a future maturity, banked only
-- on/after that date — the lifeblood of UAE trade settlement.
--   direction 'received' = a customer cheque we hold (receivable)
--   direction 'issued'   = our cheque to a supplier (payable)
-- Lifecycle: pending → deposited → cleared | bounced; bounced can be
-- re-presented (→ deposited, bounce_count++) or written off (→ cancelled);
-- pending can be cancelled (stop payment). Maturity watch-list surfaces
-- pending cheques coming due. Owns this table; emits finance.post_dated_cheque.*.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_finance_post_dated_cheques (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  company_id    text,
  cheque_number text NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('received','issued')),
  party_name    text NOT NULL,
  bank_name     text NOT NULL,
  amount        numeric(16,2) NOT NULL CHECK (amount > 0),
  currency      text NOT NULL DEFAULT 'AED',
  issue_date    date NOT NULL,
  maturity_date date NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deposited','cleared','bounced','cancelled')),
  reference     text,
  bounce_count  integer NOT NULL DEFAULT 0,
  notes         text NOT NULL DEFAULT '',
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdc_tenant   ON public.aura_finance_post_dated_cheques(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pdc_status   ON public.aura_finance_post_dated_cheques(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pdc_maturity ON public.aura_finance_post_dated_cheques(tenant_id, maturity_date);

ALTER TABLE public.aura_finance_post_dated_cheques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_finance_post_dated_cheques;
CREATE POLICY tenant_isolation_policy ON public.aura_finance_post_dated_cheques
  FOR ALL USING (tenant_id = public.current_tenant_id());

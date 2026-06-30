-- ============================================================
-- AURA OS — migration 0089: Multi-currency on customer (AR) invoices
-- ------------------------------------------------------------
-- Invoices may be raised in a foreign currency; we store the currency,
-- the rate to base (AED), and the base-converted total for consolidated
-- reporting. Existing rows default to AED at parity.
-- ============================================================

alter table public.aura_finance_customer_invoices
  add column if not exists currency      text          not null default 'AED',
  add column if not exists exchange_rate numeric(18,6) not null default 1,
  add column if not exists base_total    numeric(18,2);

-- Backfill base_total for existing rows (base = total at parity).
update public.aura_finance_customer_invoices set base_total = total where base_total is null;

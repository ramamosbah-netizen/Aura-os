-- ============================================================
-- AURA OS — migration 0096: Multi-currency on supplier (AP) invoices
-- ------------------------------------------------------------
-- Supplier invoices may be raised in a foreign currency; we store the
-- currency, the rate to base (AED), and the base-converted value for
-- consolidated reporting and FX revaluation. Existing rows default to
-- AED at parity.
-- ============================================================

alter table public.aura_finance_invoices
  add column if not exists currency      text          not null default 'AED',
  add column if not exists exchange_rate numeric(18,6) not null default 1,
  add column if not exists base_value    numeric(18,2);

-- Backfill base_value for existing rows (base = value at parity).
update public.aura_finance_invoices set base_value = value where base_value is null;

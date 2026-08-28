-- ============================================================
-- AURA OS — migration 0262: stable CRM reference on customer invoices
-- ------------------------------------------------------------
-- customer_name remains the legal snapshot; account_id is the durable link
-- used by Account 360 and reporting when an account is renamed.
-- ============================================================

alter table public.aura_finance_customer_invoices
  add column if not exists account_id text;

create index if not exists idx_customer_invoices_account
  on public.aura_finance_customer_invoices (tenant_id, account_id);

-- @DOWN
drop index if exists public.idx_customer_invoices_account;
alter table public.aura_finance_customer_invoices drop column if exists account_id;

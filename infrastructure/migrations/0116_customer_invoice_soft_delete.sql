-- ============================================================
-- AURA OS — migration 0094: soft-delete for customer invoices (TIER-2 #55, reference)
-- ============================================================
alter table public.aura_finance_customer_invoices
  add column if not exists deleted_at timestamptz;

create index if not exists idx_aura_finance_customer_invoices_live
  on public.aura_finance_customer_invoices (tenant_id) where deleted_at is null;

-- @DOWN
drop index if exists idx_aura_finance_customer_invoices_live;
alter table public.aura_finance_customer_invoices drop column if exists deleted_at;

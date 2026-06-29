-- ============================================================
-- AURA OS — migration 0046: Bank Reconciliation
-- ------------------------------------------------------------
-- Add tables for statement imports and reconciliation matches.
-- ============================================================

create table if not exists public.aura_finance_bank_transactions (
  id                    uuid        primary key,
  tenant_id             text        not null,
  bank_account_id       uuid        not null,
  transaction_date      timestamptz not null,
  amount                numeric     not null,
  description           text        not null,
  reference             text,
  reconciled_payment_id uuid,
  status                text        not null default 'unreconciled',
  created_at            timestamptz not null default now()
);

create index if not exists idx_aura_bank_tx_tenant on public.aura_finance_bank_transactions (tenant_id, bank_account_id);
create index if not exists idx_aura_bank_tx_status on public.aura_finance_bank_transactions (tenant_id, status);

alter table public.aura_finance_bank_transactions enable row level security;

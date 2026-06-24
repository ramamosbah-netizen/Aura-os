-- ============================================================
-- AURA OS — migration 0007: Contracts (third deal-chain module)
-- ------------------------------------------------------------
-- The Contracts module OWNS this table. A contract is awarded from a WON tender, so it
-- references the source tender AND the CRM account by id + name snapshots (tender_id /
-- tender_title, account_id / account_name) — no FK, no cross-module join. Namespaced
-- `aura_contracts_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_contracts_contracts (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  title        text        not null,
  reference    text,
  tender_id    text,
  tender_title text,
  account_id   text,
  account_name text,
  status       text        not null default 'draft',
  value        numeric     not null default 0,
  owner_id     text,
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_aura_contracts_tenant  on public.aura_contracts_contracts (tenant_id, created_at desc);
create index if not exists idx_aura_contracts_status  on public.aura_contracts_contracts (status);
create index if not exists idx_aura_contracts_account on public.aura_contracts_contracts (account_id);
create index if not exists idx_aura_contracts_tender  on public.aura_contracts_contracts (tender_id);

alter table public.aura_contracts_contracts enable row level security;

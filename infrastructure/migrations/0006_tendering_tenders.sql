-- ============================================================
-- AURA OS — migration 0006: Tendering tenders (second deal-chain module)
-- ------------------------------------------------------------
-- The Tendering module OWNS this table. It references a CRM account by id + a name
-- snapshot (account_id / account_name) — no FK to the CRM table, no cross-module
-- join. Namespaced `aura_tendering_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_tendering_tenders (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  title        text        not null,
  reference    text,
  account_id   text,
  account_name text,
  status       text        not null default 'draft',
  value        numeric     not null default 0,
  owner_id     text,
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_aura_tendering_tenant  on public.aura_tendering_tenders (tenant_id, created_at desc);
create index if not exists idx_aura_tendering_status  on public.aura_tendering_tenders (status);
create index if not exists idx_aura_tendering_account on public.aura_tendering_tenders (account_id);

alter table public.aura_tendering_tenders enable row level security;

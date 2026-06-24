-- ============================================================
-- AURA OS — migration 0008: Projects (final deal-chain module)
-- ------------------------------------------------------------
-- The Projects module OWNS this table. A project delivers a signed contract, so it
-- references the source contract AND the CRM account by id + name snapshots (contract_id
-- / contract_title, account_id / account_name) — no FK, no cross-module join. Namespaced
-- `aura_projects_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_projects_projects (
  id             uuid        primary key,
  tenant_id      text        not null,
  company_id     text,
  title          text        not null,
  reference      text,
  contract_id    text,
  contract_title text,
  account_id     text,
  account_name   text,
  status         text        not null default 'planned',
  value          numeric     not null default 0,
  owner_id       text,
  created_by     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_aura_projects_tenant   on public.aura_projects_projects (tenant_id, created_at desc);
create index if not exists idx_aura_projects_status   on public.aura_projects_projects (status);
create index if not exists idx_aura_projects_account  on public.aura_projects_projects (account_id);
create index if not exists idx_aura_projects_contract on public.aura_projects_projects (contract_id);

alter table public.aura_projects_projects enable row level security;

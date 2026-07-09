-- ============================================================
-- AURA OS — migration 0135: Companies master (admin center phase 2)
-- ------------------------------------------------------------
-- Multi-company registry (Vol 15 §2.1). Every document already
-- carries company_id; this table makes companies first-class:
-- admin CRUD at /admin/organization, and the app-shell company
-- switcher reads it instead of a hardcoded list. Backs
-- @aura/core CompaniesService (Postgres mode).
-- ============================================================

create table if not exists public.aura_companies (
  id            text        not null,
  tenant_id     text        not null,
  name          text        not null,
  code          text        not null default '',
  trn           text        not null default '',
  base_currency text        not null default 'AED',
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (tenant_id, id)
);

alter table public.aura_companies enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_companies;
create policy tenant_isolation_policy on public.aura_companies
  for all using (tenant_id = public.current_tenant_id());

-- @DOWN
drop table if exists public.aura_companies;

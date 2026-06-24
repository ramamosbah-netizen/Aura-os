-- ============================================================
-- AURA OS — migration 0005: CRM accounts (first business module)
-- ------------------------------------------------------------
-- The CRM module OWNS this table. No other module reads it directly — they learn
-- about accounts via `crm.account.*` events or the API. Namespaced `aura_crm_*`.
-- Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_crm_accounts (
  id          uuid        primary key,
  tenant_id   text        not null,
  company_id  text,
  name        text        not null,
  status      text        not null default 'lead',
  industry    text,
  website     text,
  owner_id    text,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_aura_crm_accounts_tenant on public.aura_crm_accounts (tenant_id, created_at desc);
create index if not exists idx_aura_crm_accounts_status on public.aura_crm_accounts (status);

alter table public.aura_crm_accounts enable row level security;

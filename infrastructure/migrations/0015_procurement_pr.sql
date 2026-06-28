-- ============================================================
-- AURA OS — migration 0015: Procurement Purchase Requests
-- ------------------------------------------------------------
-- The Procurement module OWNS this table.
-- Namespaced `aura_procurement_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_procurement_purchase_requests (
  id            uuid        primary key,
  tenant_id     text        not null,
  company_id    text,
  reference     text,
  title         text        not null,
  project_id    text,
  project_name  text,
  status        text        not null default 'draft',
  value         numeric     not null default 0,
  owner_id      text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_aura_procurement_pr_tenant on public.aura_procurement_purchase_requests (tenant_id, created_at desc);
create index if not exists idx_aura_procurement_pr_project on public.aura_procurement_purchase_requests (project_id);

alter table public.aura_procurement_purchase_requests enable row level security;

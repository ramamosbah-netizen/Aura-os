-- ============================================================
-- AURA OS kernel — migration 0029: immutable audit log ledger
-- ------------------------------------------------------------
-- Enforces a strict, immutable log of all state mutations across
-- modules, storing changesets, actors, and metadata.
-- ============================================================

create table if not exists public.aura_audit_log (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    text        not null,
  company_id   text,
  actor_id     text,
  module       text        not null,
  entity_type  text        not null,
  entity_id    text        not null,
  action       text        not null,
  changes      jsonb       not null default '{}'::jsonb,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_aura_audit_log_tenant 
  on public.aura_audit_log (tenant_id, created_at desc);
create index if not exists idx_aura_audit_log_entity 
  on public.aura_audit_log (entity_type, entity_id);

alter table public.aura_audit_log enable row level security;

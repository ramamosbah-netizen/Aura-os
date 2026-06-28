-- ============================================================
-- AURA OS — migration 0037: Integration Connectors Schema
-- ------------------------------------------------------------
-- Creates tables for managing external system integrations 
-- and event-mapping templates (SAP, Oracle, Procore, Dynamics).
-- ============================================================

create table if not exists public.aura_integration_connectors (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    text        not null,
  system_name  text        not null, -- 'sap' | 'procore' | 'dynamics' | 'oracle'
  auth_config  jsonb       not null default '{}'::jsonb, -- endpoint credentials
  mapping_rules jsonb       not null default '{}'::jsonb, -- event transformation mapping
  enabled      boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.aura_integration_connectors enable row level security;

-- Integration connectors are isolated to the active tenant session
create policy tenant_integration_connectors_policy on public.aura_integration_connectors
  for all
  using (tenant_id = public.current_tenant_id());

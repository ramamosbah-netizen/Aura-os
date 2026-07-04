-- ============================================================
-- AURA OS — migration 0127: Workspace access configuration
-- Per-tenant workspace config (users→roles, roles→allowed functions) as one
-- JSONB document. Read/written by the Administrator Center; the Command Center
-- resolves each user's visible functions from it.
-- ============================================================
create table if not exists public.aura_workspace_config (
  tenant_id  text        primary key,
  config     jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.aura_workspace_config enable row level security;
create policy workspace_config_rls on public.aura_workspace_config
  for all using (tenant_id = public.current_tenant_id());

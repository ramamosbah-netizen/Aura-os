-- ============================================================
-- AURA OS — migration 0016: Projects WBS Nodes
-- ------------------------------------------------------------
-- The Projects module OWNS this table.
-- Namespaced `aura_projects_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_projects_wbs_nodes (
  id            uuid        primary key,
  tenant_id     text        not null,
  project_id    uuid        not null,
  parent_id     uuid,
  code          text        not null,
  title         text        not null,
  planned_value numeric     not null default 0,
  earned_value  numeric     not null default 0,
  actual_cost   numeric     not null default 0,
  progress      numeric     not null default 0,
  status        text        not null default 'pending',
  created_at    timestamptz not null default now()
);

create index if not exists idx_aura_projects_wbs_tenant on public.aura_projects_wbs_nodes (tenant_id, created_at desc);
create index if not exists idx_aura_projects_wbs_project on public.aura_projects_wbs_nodes (project_id, code);

alter table public.aura_projects_wbs_nodes enable row level security;

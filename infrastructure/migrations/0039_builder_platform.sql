-- ============================================================
-- AURA OS — migration 0039: Builder Platform (Dynamic Engines)
-- ------------------------------------------------------------
-- Metadata-driven form registry, dynamic entity registry,
-- approval matrix rules, and BPMN workflow instance tracking.
-- ============================================================

-- ── Form & Entity Registry ──────────────────────────────────

create table if not exists public.aura_builder_forms (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  form_key      text        not null,
  label         text        not null,
  entity_type   text        not null,   -- e.g. 'invoice', 'purchase_order'
  fields        jsonb       not null default '[]'::jsonb,
  -- Each field: { key, label, type, required, options?, validation? }
  version       integer     not null default 1,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, form_key, version)
);

create table if not exists public.aura_builder_entities (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  entity_key    text        not null,   -- e.g. 'invoice', 'project', 'work_order'
  label         text        not null,
  module        text        not null,   -- e.g. 'finance', 'projects', 'amc'
  schema        jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (tenant_id, entity_key)
);

-- ── Approval Matrix ─────────────────────────────────────────

create table if not exists public.aura_approval_matrix (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  entity_type   text        not null,   -- e.g. 'purchase_order', 'invoice'
  rules         jsonb       not null default '[]'::jsonb,
  -- Each rule: { condition: { field, operator, value }, approvers: string[], escalateTo?: string }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, entity_type)
);

-- ── BPMN Workflow Instances ──────────────────────────────────

create table if not exists public.aura_workflow_definitions (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  workflow_key  text        not null,
  label         text        not null,
  nodes         jsonb       not null default '[]'::jsonb,
  -- Each node: { id, type: 'start'|'task'|'gateway'|'end', label, transitions: [{to, condition?}] }
  version       integer     not null default 1,
  created_at    timestamptz not null default now(),
  unique (tenant_id, workflow_key, version)
);

create table if not exists public.aura_workflow_instances (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       text        not null,
  workflow_key    text        not null,
  entity_id       text        not null,
  entity_type     text        not null,
  current_node_id text        not null,
  status          text        not null default 'running', -- 'running'|'completed'|'failed'
  context         jsonb       not null default '{}'::jsonb,
  history         jsonb       not null default '[]'::jsonb, -- [{nodeId, completedAt, actor}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── RLS Policies ────────────────────────────────────────────

alter table public.aura_builder_forms         enable row level security;
alter table public.aura_builder_entities      enable row level security;
alter table public.aura_approval_matrix       enable row level security;
alter table public.aura_workflow_definitions  enable row level security;
alter table public.aura_workflow_instances    enable row level security;

create policy builder_forms_rls         on public.aura_builder_forms         for all using (tenant_id = public.current_tenant_id());
create policy builder_entities_rls      on public.aura_builder_entities       for all using (tenant_id = public.current_tenant_id());
create policy approval_matrix_rls       on public.aura_approval_matrix        for all using (tenant_id = public.current_tenant_id());
create policy workflow_definitions_rls  on public.aura_workflow_definitions   for all using (tenant_id = public.current_tenant_id());
create policy workflow_instances_rls    on public.aura_workflow_instances      for all using (tenant_id = public.current_tenant_id());

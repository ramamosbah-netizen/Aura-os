-- ============================================================
-- AURA OS kernel — migration 0003: Platform Workflow engine
-- ------------------------------------------------------------
-- A generic state machine any module drives (PO approval, contract sign-off, NCR
-- disposition…). Definitions are global ('') or tenant-scoped; instances govern an
-- aggregate and carry their own transition history. Namespaced `aura_*` (see 0001).
-- Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_workflow_definitions (
  id              uuid        primary key,
  key             text        not null,
  tenant_id       text        not null default '',   -- '' = global (all tenants)
  name            text        not null,
  initial_state   text        not null,
  states          jsonb       not null default '[]'::jsonb,
  terminal_states jsonb       not null default '[]'::jsonb,
  transitions     jsonb       not null default '[]'::jsonb,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  unique (key, tenant_id)
);

create table if not exists public.aura_workflow_instances (
  id             uuid        primary key,
  definition_key text        not null,
  tenant_id      text        not null,
  company_id     text,
  aggregate_type text        not null,
  aggregate_id   text        not null,
  current_state  text        not null,
  status         text        not null default 'open',
  history        jsonb       not null default '[]'::jsonb,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_aura_wf_inst_tenant    on public.aura_workflow_instances (tenant_id, created_at desc);
create index if not exists idx_aura_wf_inst_aggregate on public.aura_workflow_instances (aggregate_type, aggregate_id);
create index if not exists idx_aura_wf_inst_def       on public.aura_workflow_instances (definition_key);
create index if not exists idx_aura_wf_inst_status    on public.aura_workflow_instances (status);

-- Lock down: RLS on, no policies → only the service-role back-end touches these.
alter table public.aura_workflow_definitions enable row level security;
alter table public.aura_workflow_instances   enable row level security;

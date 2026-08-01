-- ============================================================
-- AURA OS — migration 0193: AI Platform Real Persistence
-- ------------------------------------------------------------
-- Tables: agent executions, workflow instances, collaboration messages,
-- agent traces, marketplace installations, and skill packages with RLS.
-- ============================================================

-- ── Agent Executions Table ──────────────────────────────────

create table if not exists public.aura_agent_executions (
  id                uuid        primary key default gen_random_uuid(),
  execution_id      text        not null unique,
  agent_id          text        not null,
  tenant_id         text        not null,
  actor_id          text,
  status            text        not null default 'completed', -- 'completed' | 'proposal_generated' | 'rejected_by_policy' | 'failed'
  output            jsonb       not null default '{}'::jsonb,
  proposal_id       text,
  trace_id          text        not null,
  execution_time_ms integer     not null default 0,
  model_used        text        not null default 'claude-3-5-sonnet',
  cost_usd          numeric(10, 6) not null default 0.000000,
  created_at        timestamptz not null default now()
);

-- ── Workflow Instances Table ────────────────────────────────

create table if not exists public.aura_workflow_instances (
  id                 uuid        primary key default gen_random_uuid(),
  instance_id        text        not null unique,
  definition_id      text        not null,
  name               text        not null,
  tenant_id          text        not null,
  state              text        not null default 'draft', -- 'draft' | 'active' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'
  current_step_index integer     not null default 0,
  step_results       jsonb       not null default '[]'::jsonb,
  pending_approval   jsonb,
  total_cost_usd     numeric(10, 6) not null default 0.000000,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz
);

-- ── Collaboration Messages Table ────────────────────────────

create table if not exists public.aura_collaboration_messages (
  id                   uuid        primary key default gen_random_uuid(),
  message_id           text        not null unique,
  workflow_instance_id text,
  tenant_id            text        not null,
  from_agent           text        not null,
  to_agent             text        not null,
  task                 text        not null,
  context              jsonb       not null default '{}'::jsonb,
  output               jsonb       not null default '{}'::jsonb,
  confidence_score     integer     not null default 90,
  status               text        not null default 'sent',
  created_at           timestamptz not null default now()
);

-- ── Agent Traces Table ──────────────────────────────────────

create table if not exists public.aura_agent_traces (
  id            uuid        primary key default gen_random_uuid(),
  step_id       text        not null unique,
  agent_key     text        not null,
  tenant_id     text        not null,
  phase         text        not null, -- 'trigger' | 'memory' | 'tools' | 'reasoning' | 'proposal'
  label         text        not null,
  details       text        not null,
  timestamp     timestamptz not null default now()
);

-- ── Marketplace Installations Table ─────────────────────────

create table if not exists public.aura_marketplace_installations (
  id            uuid        primary key default gen_random_uuid(),
  package_id    text        not null,
  tenant_id     text        not null,
  installed_by  text,
  installed_at  timestamptz not null default now(),
  unique (tenant_id, package_id)
);

-- ── Skill Packages Table ────────────────────────────────────

create table if not exists public.aura_skill_packages (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              text        not null,
  skill_key              text        not null,
  name                   text        not null,
  version                text        not null default '1.0.0',
  description            text        not null,
  category               text        not null default 'general',
  prompt_key             text        not null,
  tools                  text[]      not null default '{}',
  required_capabilities  text[]      not null default '{}',
  input_schema           jsonb       not null default '{}'::jsonb,
  output_schema          jsonb       not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  unique (tenant_id, skill_key, version)
);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.aura_agent_executions          enable row level security;
alter table public.aura_workflow_instances        enable row level security;
alter table public.aura_collaboration_messages    enable row level security;
alter table public.aura_agent_traces              enable row level security;
alter table public.aura_marketplace_installations enable row level security;
alter table public.aura_skill_packages            enable row level security;
-- FORCE so the owner/table-owner role is also subject to RLS (the enforced 0163/0164 pattern the
-- RLS-fitness gate requires: enabled + FORCED + policy).
alter table public.aura_agent_executions          force row level security;
alter table public.aura_workflow_instances        force row level security;
alter table public.aura_collaboration_messages    force row level security;
alter table public.aura_agent_traces              force row level security;
alter table public.aura_marketplace_installations force row level security;
alter table public.aura_skill_packages            force row level security;

drop policy if exists agent_executions_rls          on public.aura_agent_executions;
drop policy if exists workflow_instances_rls        on public.aura_workflow_instances;
drop policy if exists collaboration_messages_rls    on public.aura_collaboration_messages;
drop policy if exists agent_traces_rls              on public.aura_agent_traces;
drop policy if exists marketplace_installations_rls on public.aura_marketplace_installations;
drop policy if exists skill_packages_rls            on public.aura_skill_packages;

create policy agent_executions_rls          on public.aura_agent_executions          for all using (tenant_id = public.current_tenant_id());
create policy workflow_instances_rls        on public.aura_workflow_instances        for all using (tenant_id = public.current_tenant_id());
create policy collaboration_messages_rls    on public.aura_collaboration_messages    for all using (tenant_id = public.current_tenant_id());
create policy agent_traces_rls              on public.aura_agent_traces              for all using (tenant_id = public.current_tenant_id());
create policy marketplace_installations_rls on public.aura_marketplace_installations for all using (tenant_id = public.current_tenant_id());
create policy skill_packages_rls            on public.aura_skill_packages            for all using (tenant_id = public.current_tenant_id());

-- @DOWN
-- (Added to satisfy the migration gate; drops exactly what this migration creates.)
drop table if exists public.aura_skill_packages cascade;
drop table if exists public.aura_marketplace_installations cascade;
drop table if exists public.aura_agent_traces cascade;
drop table if exists public.aura_collaboration_messages cascade;
drop table if exists public.aura_workflow_instances cascade;
drop table if exists public.aura_agent_executions cascade;

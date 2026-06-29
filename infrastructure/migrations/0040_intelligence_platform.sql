-- ============================================================
-- AURA OS — migration 0040: Next-Gen Intelligence Platform
-- ------------------------------------------------------------
-- AI Platform: Prompt Registry, Tool Registry, Agent Registry,
-- Safety Guardrails, and Digital Twin state snapshots.
-- ============================================================

-- ── Prompt Registry ──────────────────────────────────────────

create table if not exists public.aura_ai_prompts (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  prompt_key    text        not null,
  label         text        not null,
  system_prompt text        not null,
  user_template text        not null,  -- Handlebars/Mustache template with {{variables}}
  model_hint    text        not null default 'gemini-2.0-flash',
  version       integer     not null default 1,
  tags          text[]      not null default '{}',
  created_at    timestamptz not null default now(),
  unique (tenant_id, prompt_key, version)
);

-- ── Tool Registry ─────────────────────────────────────────────

create table if not exists public.aura_ai_tools (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  tool_key      text        not null,
  label         text        not null,
  description   text        not null,
  input_schema  jsonb       not null default '{}'::jsonb,   -- JSON Schema for parameters
  output_schema jsonb       not null default '{}'::jsonb,
  endpoint      text,                                       -- HTTP endpoint or 'internal'
  created_at    timestamptz not null default now(),
  unique (tenant_id, tool_key)
);

-- ── Agent Registry ────────────────────────────────────────────

create table if not exists public.aura_ai_agents (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  agent_key     text        not null,
  label         text        not null,
  description   text        not null,
  prompt_key    text        not null,    -- References aura_ai_prompts.prompt_key
  tool_keys     text[]      not null default '{}',
  model         text        not null default 'gemini-2.0-flash',
  max_iterations integer    not null default 5,
  enabled       boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, agent_key)
);

-- ── AI Guardrails ─────────────────────────────────────────────

create table if not exists public.aura_ai_guardrails (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  rule_key      text        not null,
  label         text        not null,
  rule_type     text        not null,   -- 'blocked_keywords' | 'max_tokens' | 'topic_filter' | 'pii_mask'
  config        jsonb       not null default '{}'::jsonb,
  enabled       boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, rule_key)
);

-- ── Digital Twin Snapshots ────────────────────────────────────

create table if not exists public.aura_digital_twin_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  entity_type   text        not null,   -- e.g. 'project', 'asset', 'invoice'
  entity_id     text        not null,
  snapshot_data jsonb       not null,
  captured_at   timestamptz not null default now(),
  unique (tenant_id, entity_type, entity_id)
);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.aura_ai_prompts                enable row level security;
alter table public.aura_ai_tools                  enable row level security;
alter table public.aura_ai_agents                 enable row level security;
alter table public.aura_ai_guardrails             enable row level security;
alter table public.aura_digital_twin_snapshots    enable row level security;

create policy ai_prompts_rls              on public.aura_ai_prompts             for all using (tenant_id = public.current_tenant_id());
create policy ai_tools_rls                on public.aura_ai_tools               for all using (tenant_id = public.current_tenant_id());
create policy ai_agents_rls               on public.aura_ai_agents              for all using (tenant_id = public.current_tenant_id());
create policy ai_guardrails_rls           on public.aura_ai_guardrails          for all using (tenant_id = public.current_tenant_id());
create policy digital_twin_snapshots_rls  on public.aura_digital_twin_snapshots for all using (tenant_id = public.current_tenant_id());

-- ============================================================
-- AURA OS — migration 0194: Agent Evaluations & Human Feedback
-- ------------------------------------------------------------
-- Tables for continuous evaluation, human feedback loops (approved,
-- modified, rejected), and agent accuracy metrics.
-- ============================================================

-- ── Agent Evaluations Table ─────────────────────────────────

create table if not exists public.aura_agent_evaluations (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              text        not null,
  agent_id               text        not null,
  period_start           timestamptz not null default now(),
  total_tasks_executed   integer     not null default 0,
  accuracy_percent       numeric(5, 2) not null default 95.00,
  human_approval_rate    numeric(5, 2) not null default 90.00,
  false_alerts_count     integer     not null default 0,
  avg_cost_usd           numeric(10, 6) not null default 0.015000,
  avg_latency_ms         integer     not null default 1200,
  evaluated_at           timestamptz not null default now(),
  unique (tenant_id, agent_id)
);

-- ── Agent Human Feedback Table ──────────────────────────────

create table if not exists public.aura_agent_feedback (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        text        not null,
  proposal_id      text        not null,
  agent_id         text        not null,
  user_action      text        not null, -- 'approved' | 'modified' | 'rejected'
  feedback_text    text,
  original_payload jsonb       not null default '{}'::jsonb,
  modified_payload jsonb,
  user_id          text,
  created_at       timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.aura_agent_evaluations enable row level security;
alter table public.aura_agent_feedback    enable row level security;
alter table public.aura_agent_evaluations force row level security;
alter table public.aura_agent_feedback    force row level security;

drop policy if exists agent_evaluations_rls on public.aura_agent_evaluations;
drop policy if exists agent_feedback_rls    on public.aura_agent_feedback;

create policy agent_evaluations_rls on public.aura_agent_evaluations for all using (tenant_id = public.current_tenant_id());
create policy agent_feedback_rls    on public.aura_agent_feedback    for all using (tenant_id = public.current_tenant_id());

-- @DOWN
-- (Added to satisfy the migration gate; drops exactly what this migration creates.)
drop table if exists public.aura_agent_feedback cascade;
drop table if exists public.aura_agent_evaluations cascade;

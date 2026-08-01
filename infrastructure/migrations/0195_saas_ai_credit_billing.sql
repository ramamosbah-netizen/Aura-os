-- ============================================================
-- AURA OS — migration 0195: SaaS AI Credit Billing & Metering
-- ------------------------------------------------------------
-- Tables for tenant AI credit balances, consumption ledgers, and
-- subscription plan quotas.
-- ============================================================

-- ── Tenant AI Credits Table ─────────────────────────────────

create table if not exists public.aura_tenant_ai_credits (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              text        not null unique,
  plan_tier              text        not null default 'enterprise', -- 'starter' | 'pro' | 'enterprise'
  balance_credits        numeric(12, 2) not null default 50000.00,
  monthly_quota_credits  numeric(12, 2) not null default 50000.00,
  auto_recharge          boolean     not null default false,
  updated_at             timestamptz not null default now()
);

-- ── AI Credit Ledger Table ──────────────────────────────────

create table if not exists public.aura_ai_credit_ledger (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        text        not null,
  agent_id         text        not null,
  task_type        text        not null default 'agent_execution',
  credits_consumed numeric(10, 2) not null default 1.00,
  balance_after    numeric(12, 2) not null default 49999.00,
  created_at       timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.aura_tenant_ai_credits enable row level security;
alter table public.aura_ai_credit_ledger  enable row level security;
alter table public.aura_tenant_ai_credits force row level security;
alter table public.aura_ai_credit_ledger  force row level security;

drop policy if exists tenant_ai_credits_rls on public.aura_tenant_ai_credits;
drop policy if exists ai_credit_ledger_rls  on public.aura_ai_credit_ledger;

create policy tenant_ai_credits_rls on public.aura_tenant_ai_credits for all using (tenant_id = public.current_tenant_id());
create policy ai_credit_ledger_rls  on public.aura_ai_credit_ledger  for all using (tenant_id = public.current_tenant_id());

-- @DOWN
-- (Added to satisfy the migration gate; drops exactly what this migration creates.)
drop table if exists public.aura_ai_credit_ledger cascade;
drop table if exists public.aura_tenant_ai_credits cascade;

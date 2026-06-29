-- ============================================================
-- AURA OS — migration 0035: Profit & Loss Read Model
-- ------------------------------------------------------------
-- Provides direct access to high-performance monthly P&L summaries.
-- ============================================================

create table if not exists public.aura_finance_pl_projection (
  tenant_id       text        not null,
  company_id      text,
  period_month    text        not null, -- e.g. "2026-06"
  revenue         numeric(15,2) not null default 0.00,
  expense         numeric(15,2) not null default 0.00,
  updated_at      timestamptz not null default now(),
  constraint pk_aura_finance_pl_projection primary key (tenant_id, period_month)
);

alter table public.aura_finance_pl_projection enable row level security;

create policy tenant_pl_projection_policy on public.aura_finance_pl_projection
  for all
  using (tenant_id = public.current_tenant_id());

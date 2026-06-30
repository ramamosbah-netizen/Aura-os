-- ============================================================
-- AURA OS — migration 0090: Finance profit centres
-- ------------------------------------------------------------
-- A management dimension tracking contribution (revenue − cost): a
-- profit-centre master + a profit_center_id tag on journal lines. The
-- report folds the GL by tag with contribution = credit − debit.
-- ============================================================

create table if not exists public.aura_finance_profit_centers (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   text        not null,
  company_id  text,
  code        text        not null,
  name        text        not null,
  active      boolean     not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (tenant_id, code)
);
create index if not exists idx_finance_profit_centers_tenant on public.aura_finance_profit_centers(tenant_id);

alter table public.aura_finance_profit_centers enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_finance_profit_centers;
create policy tenant_isolation_policy on public.aura_finance_profit_centers
  for all using (tenant_id = public.current_tenant_id());

-- Tag journal lines with an optional profit centre.
alter table public.aura_finance_journal_lines
  add column if not exists profit_center_id uuid;

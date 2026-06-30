-- ============================================================
-- AURA OS — migration 0076: Finance Budgets
-- ------------------------------------------------------------
-- A named budget over a date range with a budgeted amount per GL account (lines as
-- jsonb). "Actual" is never stored — budget-vs-actual is folded live from the ledger
-- for the same range, so it always reconciles to the books.
-- ============================================================

create table if not exists public.aura_finance_budgets (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  text        not null,
  name       text        not null,
  from_date  date        not null,
  to_date    date        not null,
  lines      jsonb       not null default '[]'::jsonb,   -- [{accountId, accountCode, accountName, amount}]
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists idx_aura_finance_budget_tenant
  on public.aura_finance_budgets (tenant_id, created_at desc);

alter table public.aura_finance_budgets enable row level security;

create policy finance_budgets_rls on public.aura_finance_budgets
  for all using (tenant_id = public.current_tenant_id());

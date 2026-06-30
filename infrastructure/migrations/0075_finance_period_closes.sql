-- ============================================================
-- AURA OS — migration 0075: Finance Period Close
-- ------------------------------------------------------------
-- Locks a fiscal period (calendar month 'YYYY-MM') against further journal posting.
-- A period is closed iff a row exists for (tenant_id, period); reopening deletes it.
-- JournalService consults this table before every post.
-- ============================================================

create table if not exists public.aura_finance_period_closes (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  text        not null,
  period     text        not null,                 -- 'YYYY-MM'
  closed_at  timestamptz not null default now(),
  closed_by  text,
  note       text,
  unique (tenant_id, period)
);

create index if not exists idx_aura_finance_period_close_tenant
  on public.aura_finance_period_closes (tenant_id, period);

alter table public.aura_finance_period_closes enable row level security;

create policy finance_period_closes_rls on public.aura_finance_period_closes
  for all using (tenant_id = public.current_tenant_id());

-- ============================================================
-- AURA OS — migration 0224: customer refunds
-- ------------------------------------------------------------
-- Cash returned to a customer — an over-payment, a cancelled order, or a credit
-- note the customer wants paid out rather than applied to a future invoice.
-- Paying a refund posts Dr Accounts Receivable / Cr Bank (the mirror of a
-- receipt): the customer's credit is cleared and cash leaves the account.
-- ============================================================

create table if not exists public.aura_finance_customer_refunds (
  id             uuid primary key,
  tenant_id      text not null,
  company_id     text,
  refund_number  text not null,
  customer_name  text not null,
  reference      text,
  reason         text,
  amount         numeric(14,2) not null default 0 check (amount >= 0),
  currency       text not null default 'AED',
  refund_date    date not null,
  status         text not null default 'draft' check (status in ('draft','paid','cancelled')),
  paid_at        timestamptz,
  created_by     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_customer_refunds_tenant on public.aura_finance_customer_refunds (tenant_id);
create unique index if not exists uq_customer_refunds_number on public.aura_finance_customer_refunds (tenant_id, refund_number);

alter table public.aura_finance_customer_refunds enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_finance_customer_refunds' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_finance_customer_refunds
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_finance_customer_refunds;

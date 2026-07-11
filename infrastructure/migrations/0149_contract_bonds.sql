-- ============================================================
-- AURA OS — migration 0149: contract bonds & guarantees
-- ------------------------------------------------------------
-- Bank instruments securing each contract: performance bond, advance-payment
-- guarantee, retention bond, warranty bond, tender bond. The expiry date is
-- the commercial watchpoint (expiring/expired bonds surface on the contracts
-- register and the contract 360).
-- ============================================================

create table if not exists public.aura_contract_bonds (
  id           uuid primary key,
  tenant_id    text not null,
  company_id   text,
  contract_id  uuid not null,
  kind         text not null check (kind in ('performance','advance_payment','retention','warranty','tender_bond')),
  reference    text not null,
  bank         text,
  amount       numeric(18,2) not null default 0,
  issue_date   date,
  expiry_date  date,
  status       text not null default 'active' check (status in ('active','released','called','expired')),
  notes        text,
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_contract_bonds_tenant on public.aura_contract_bonds (tenant_id);
create index if not exists idx_contract_bonds_contract on public.aura_contract_bonds (contract_id);

alter table public.aura_contract_bonds enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_contract_bonds' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_contract_bonds
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_contract_bonds;

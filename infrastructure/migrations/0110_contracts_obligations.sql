-- ============================================================
-- AURA OS — migration 0110: Contract obligation tracking
-- ------------------------------------------------------------
-- Tracked deliverables/milestones/compliance commitments under a contract, with due dates,
-- responsible party, and status — the basis for reminders and breach flagging.
-- ============================================================

create table if not exists public.aura_contracts_obligations (
  id                uuid primary key,
  tenant_id         text not null,
  company_id        text,
  contract_id       text not null,
  contract_title    text,
  title             text not null,
  description       text,
  obligation_type   text not null default 'deliverable',
  responsible_party text not null default 'us',
  due_date          date not null,
  status            text not null default 'open',
  completed_date    date,
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_contracts_obligations_tenant   on public.aura_contracts_obligations (tenant_id);
create index if not exists idx_contracts_obligations_contract on public.aura_contracts_obligations (contract_id);
create index if not exists idx_contracts_obligations_due      on public.aura_contracts_obligations (tenant_id, status, due_date);

alter table public.aura_contracts_obligations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_contracts_obligations' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_contracts_obligations
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

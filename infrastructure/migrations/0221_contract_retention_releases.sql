-- ============================================================
-- AURA OS — migration 0221: contract retention releases
-- ------------------------------------------------------------
-- Retention is withheld from every interim payment certificate (5% of work
-- done, capped as a % of the contract value) and is the contractor's money all
-- along. It comes back in tranches: conventionally half at practical
-- completion, the balance at the end of the defects liability period.
--
-- Until this table the IPC math withheld retention correctly and nothing ever
-- released it. A release is raised as a draft, approved under the same
-- segregation-of-duties + value-ceiling controls as certifying an IPC, and its
-- approval is the AR trigger that bills the client for the tranche.
-- ============================================================

create table if not exists public.aura_contract_retention_releases (
  id             uuid primary key,
  tenant_id      text not null,
  company_id     text,
  contract_id    uuid not null,
  contract_title text,
  account_id     text,
  account_name   text,
  sequence       integer not null default 1,
  reference      text not null,
  kind           text not null default 'practical_completion'
                 check (kind in ('practical_completion','defects_liability','other')),
  amount         numeric(18,2) not null default 0,
  release_date   date,
  status         text not null default 'draft' check (status in ('draft','approved','rejected')),
  notes          text,
  created_by     text,
  created_at     timestamptz not null default now(),
  approved_by    text,
  approved_at    timestamptz
);

create index if not exists idx_retention_releases_tenant on public.aura_contract_retention_releases (tenant_id);
create index if not exists idx_retention_releases_contract on public.aura_contract_retention_releases (contract_id);

alter table public.aura_contract_retention_releases enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_contract_retention_releases' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_contract_retention_releases
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_contract_retention_releases;

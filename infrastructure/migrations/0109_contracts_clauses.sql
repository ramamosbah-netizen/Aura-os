-- ============================================================
-- AURA OS — migration 0109: Contract clause library
-- ------------------------------------------------------------
-- Reusable, tenant-scoped contract-language templates (payment/retention/LD/warranty/…),
-- categorised + tagged, versioned by revision. Pulled into contracts by admins/estimators.
-- ============================================================

create table if not exists public.aura_contracts_clauses (
  id          uuid primary key,
  tenant_id   text not null,
  company_id  text,
  code        text not null,
  title       text not null,
  category    text not null default 'general',
  body        text not null,
  tags        jsonb not null default '[]'::jsonb,
  revision    integer not null default 1,
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_contracts_clauses_tenant   on public.aura_contracts_clauses (tenant_id);
create index if not exists idx_contracts_clauses_category on public.aura_contracts_clauses (tenant_id, category);

alter table public.aura_contracts_clauses enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_contracts_clauses' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_contracts_clauses
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

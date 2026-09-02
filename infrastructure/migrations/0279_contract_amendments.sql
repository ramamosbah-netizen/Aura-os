-- AURA OS — migration 0279: formal post-sign Contract amendments.
create table if not exists public.aura_contracts_amendments (
  id uuid primary key,
  tenant_id text not null,
  contract_id text not null,
  base_revision_id uuid not null references public.aura_contracts_revisions(id),
  amendment_number integer not null check (amendment_number > 0),
  title text not null check (length(btrim(title)) > 0),
  content text not null check (length(btrim(content)) > 0),
  source_variation_id text,
  status text not null check (status in ('draft','review','approved','signed','returned','rejected')),
  created_by text,
  created_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  signed_by text,
  signed_at timestamptz,
  unique (tenant_id, contract_id, amendment_number)
);
create index if not exists idx_contract_amendments_contract on public.aura_contracts_amendments (tenant_id, contract_id, amendment_number);
alter table public.aura_contracts_amendments enable row level security;
alter table public.aura_contracts_amendments force row level security;
drop policy if exists tenant_isolation_policy on public.aura_contracts_amendments;
create policy tenant_isolation_policy on public.aura_contracts_amendments for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
-- @DOWN
drop table if exists public.aura_contracts_amendments;


-- AURA OS — migration 0276: Contract CLM revision snapshots
-- Additive, tenant-owned pre-sign contractual content. Signed rows are immutable
-- by the application service; the original clause library is never rewritten.

create table if not exists public.aura_contracts_revisions (
  id                  uuid primary key,
  tenant_id           text not null,
  contract_id         text not null,
  revision_number     integer not null check (revision_number > 0),
  parent_revision_id  uuid,
  status              text not null check (status in ('draft','internal_review','client_review','negotiation','approved','signed','returned','rejected','superseded')),
  revision_reason     text,
  terms               jsonb not null default '{}'::jsonb,
  clauses             jsonb not null default '[]'::jsonb,
  created_by          text,
  created_at          timestamptz not null default now(),
  approved_by         text,
  approved_at         timestamptz,
  signed_by           text,
  signed_at           timestamptz,
  unique (tenant_id, contract_id, revision_number)
);

create index if not exists idx_contracts_revisions_contract
  on public.aura_contracts_revisions (tenant_id, contract_id, revision_number);
create index if not exists idx_contracts_revisions_status
  on public.aura_contracts_revisions (tenant_id, status);

alter table public.aura_contracts_revisions enable row level security;
alter table public.aura_contracts_revisions force row level security;
drop policy if exists tenant_isolation_policy on public.aura_contracts_revisions;
create policy tenant_isolation_policy on public.aura_contracts_revisions
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- @DOWN
drop table if exists public.aura_contracts_revisions;

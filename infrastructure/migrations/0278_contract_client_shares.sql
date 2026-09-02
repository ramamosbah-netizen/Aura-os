-- AURA OS — migration 0278: controlled Contract client-share provenance.
-- This records preparation/dispatch intent; delivery is only provider-confirmed.
create table if not exists public.aura_contracts_client_shares (
  id uuid primary key,
  tenant_id text not null,
  contract_id text not null,
  revision_id uuid not null references public.aura_contracts_revisions(id),
  recipient text not null check (length(btrim(recipient)) > 0),
  method text not null check (method in ('download','email','link')),
  state text not null check (state in ('prepared','dispatched','delivered','failed')),
  shared_by text,
  shared_at timestamptz not null default now(),
  correlation_id text not null,
  failure_reason text
);
create unique index if not exists uq_contract_client_share_correlation on public.aura_contracts_client_shares (tenant_id, correlation_id);
create index if not exists idx_contract_client_shares_contract on public.aura_contracts_client_shares (tenant_id, contract_id, shared_at);
alter table public.aura_contracts_client_shares enable row level security;
alter table public.aura_contracts_client_shares force row level security;
drop policy if exists tenant_isolation_policy on public.aura_contracts_client_shares;
create policy tenant_isolation_policy on public.aura_contracts_client_shares for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
-- @DOWN
drop table if exists public.aura_contracts_client_shares;


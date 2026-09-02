-- AURA OS — migration 0277: contract-specific negotiation evidence
-- Pre-sign comments/change requests are immutable content; only their resolution
-- state is mutable through ContractNegotiationService.

create table if not exists public.aura_contracts_negotiation_items (
  id uuid primary key,
  tenant_id text not null,
  contract_id text not null,
  revision_id uuid not null references public.aura_contracts_revisions(id),
  item_type text not null check (item_type in ('comment','change_request')),
  content text not null check (length(btrim(content)) > 0),
  visibility text not null check (visibility in ('internal','client_visible')),
  status text not null check (status in ('open','resolved','rejected')),
  owner_id text,
  resolution text,
  created_by text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_contracts_negotiation_contract on public.aura_contracts_negotiation_items (tenant_id, contract_id, created_at);
create index if not exists idx_contracts_negotiation_revision on public.aura_contracts_negotiation_items (tenant_id, revision_id);
alter table public.aura_contracts_negotiation_items enable row level security;
alter table public.aura_contracts_negotiation_items force row level security;
drop policy if exists tenant_isolation_policy on public.aura_contracts_negotiation_items;
create policy tenant_isolation_policy on public.aura_contracts_negotiation_items
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- @DOWN
drop table if exists public.aura_contracts_negotiation_items;


-- AURA OS — migration 0280: tenant-safe Contract CLM parent integrity.
--
-- The CLM child tables already had tenant RLS and a revision_id FK, but the
-- separate tenant_id/contract_id columns could still be paired with a
-- revision belonging to another tenant or contract when written below the
-- application service boundary.  Composite foreign keys make the immutable
-- revision lineage enforceable by PostgreSQL as well as by the domain.

create unique index if not exists uq_contract_revisions_tenant_contract_id
  on public.aura_contracts_revisions (tenant_id, contract_id, id);

alter table public.aura_contracts_negotiation_items
  add constraint aura_contracts_negotiation_revision_parent_fk
  foreign key (tenant_id, contract_id, revision_id)
  references public.aura_contracts_revisions (tenant_id, contract_id, id);

alter table public.aura_contracts_client_shares
  add constraint aura_contracts_client_share_revision_parent_fk
  foreign key (tenant_id, contract_id, revision_id)
  references public.aura_contracts_revisions (tenant_id, contract_id, id);

alter table public.aura_contracts_amendments
  add constraint aura_contracts_amendment_revision_parent_fk
  foreign key (tenant_id, contract_id, base_revision_id)
  references public.aura_contracts_revisions (tenant_id, contract_id, id);

-- @DOWN
alter table public.aura_contracts_amendments drop constraint if exists aura_contracts_amendment_revision_parent_fk;
alter table public.aura_contracts_client_shares drop constraint if exists aura_contracts_client_share_revision_parent_fk;
alter table public.aura_contracts_negotiation_items drop constraint if exists aura_contracts_negotiation_revision_parent_fk;
drop index if exists public.uq_contract_revisions_tenant_contract_id;

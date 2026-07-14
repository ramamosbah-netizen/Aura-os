-- ============================================================
-- AURA OS — migration 0167: bid-time sourcing into the estimate (Roadmap R5 / G-P1-4)
-- ------------------------------------------------------------
-- Links a tender rate-build-up COMPONENT (material/subcontract line) to the procurement
-- pre-award RFQ QUOTE it was sourced from, so bid estimates are grounded in real supplier
-- prices. One source per component (unique buildup_id+component_id). Indexed by quote_id/rfq_id
-- so the award reactor (`procurement.rfq.awarded` → restamp linked components) is O(indexed),
-- and by tender_id for the pricing sheet's "sourced / stale" view. `sourced_unit_cost` is the
-- quote unit cost stamped at sourcing time; comparing it to the live quote flags a stale estimate.
-- `previous_unit_cost` is the component's pre-source rate, restored on un-source.
-- ============================================================

create table if not exists public.aura_tendering_estimate_sources (
  id                 uuid primary key,
  tenant_id          text not null,
  company_id         text,
  tender_id          uuid not null,
  buildup_id         uuid not null,
  boq_item_id        uuid not null,
  component_id       uuid not null,
  rfq_id             uuid not null,
  quote_id           uuid not null,
  supplier_name      text not null,
  sourced_unit_cost  numeric(18,4) not null default 0,
  previous_unit_cost numeric(18,4) not null default 0,
  sourced_at         timestamptz not null default now(),
  created_by         text
);

create unique index if not exists uq_estimate_sources_component
  on public.aura_tendering_estimate_sources (buildup_id, component_id);
create index if not exists idx_estimate_sources_tender on public.aura_tendering_estimate_sources (tenant_id, tender_id);
create index if not exists idx_estimate_sources_quote  on public.aura_tendering_estimate_sources (quote_id);
create index if not exists idx_estimate_sources_rfq    on public.aura_tendering_estimate_sources (rfq_id);

-- Tenant isolation (R1 fitness gate: every tenant-scoped table must be ENABLE + FORCE + policy).
alter table public.aura_tendering_estimate_sources enable row level security;
alter table public.aura_tendering_estimate_sources force row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_tendering_estimate_sources' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_tendering_estimate_sources
      for all
      using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)
      with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_tendering_estimate_sources;

-- ============================================================
-- AURA OS — migration 0121: tendering estimate engine
-- ------------------------------------------------------------
-- Rate build-ups behind BOQ item rates: direct-cost components (jsonb:
-- material/labour/plant/subcontract) + overhead % + profit % → selling rate.
-- One build-up per BOQ item.
-- ============================================================

create table if not exists public.aura_tendering_rate_buildups (
  id               uuid primary key,
  tenant_id        text not null,
  company_id       text,
  tender_id        uuid not null,
  boq_item_id      uuid not null,
  components       jsonb not null default '[]'::jsonb,
  direct_cost      numeric(18,2) not null default 0,
  overhead_percent numeric(6,2) not null default 0,
  profit_percent   numeric(6,2) not null default 0,
  overhead_amount  numeric(18,2) not null default 0,
  profit_amount    numeric(18,2) not null default 0,
  selling_rate     numeric(18,2) not null default 0,
  notes            text,
  created_by       text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_tender_buildups_tenant on public.aura_tendering_rate_buildups (tenant_id);
create index if not exists idx_tender_buildups_tender on public.aura_tendering_rate_buildups (tender_id);
create unique index if not exists uq_tender_buildups_boq_item on public.aura_tendering_rate_buildups (tenant_id, boq_item_id);

alter table public.aura_tendering_rate_buildups enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_tendering_rate_buildups' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_tendering_rate_buildups
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

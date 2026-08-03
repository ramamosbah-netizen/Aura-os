-- ============================================================
-- AURA OS — migration 0210: site plant/equipment usage (the Plant cost strand)
-- ------------------------------------------------------------
-- A PlantUsage records a plant/equipment item working on a project for N hours at an hourly rate
-- (owned-fleet internal hire rate or external hire cost). hours × rate = cost, which the Transaction
-- Engine posts as ACTUAL against the coded CBS cost line (source 'plant_usage', hours as quantity).
-- Mirrors site labour allocations. Owned by site.
-- ============================================================

create table if not exists public.aura_site_plant_usage (
  id           uuid primary key,
  tenant_id    text not null,
  company_id   text,
  project_id   text not null,
  project_name text,
  cbs_node_id  text,
  date         date not null,
  equipment    text not null,
  hours        numeric(10,2) not null default 0,
  rate         numeric(14,2) not null default 0,
  cost         numeric(14,2) not null default 0,
  notes        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_site_plant_tenant  on public.aura_site_plant_usage (tenant_id);
create index if not exists idx_site_plant_project on public.aura_site_plant_usage (project_id, date);

alter table public.aura_site_plant_usage enable row level security;
alter table public.aura_site_plant_usage force row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_site_plant_usage' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_site_plant_usage
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_site_plant_usage;

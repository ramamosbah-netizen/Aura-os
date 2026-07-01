-- ============================================================
-- AURA OS — migration 0102: Site labour allocation (manpower by trade)
-- ------------------------------------------------------------
-- Daily manpower on a project by trade (headcount × hours = man-hours), the basis for
-- labour productivity, cost allocation, and the site diary's manpower section.
-- ============================================================

create table if not exists public.aura_site_labour_allocations (
  id                 uuid primary key,
  tenant_id          text not null,
  company_id         text,
  project_id         text not null,
  project_name       text,
  date               date not null,
  trade              text not null,
  headcount          numeric(10,2) not null default 0,
  hours              numeric(10,2) not null default 0,
  man_hours          numeric(12,2) not null default 0,
  subcontractor_name text,
  notes              text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_site_labour_tenant  on public.aura_site_labour_allocations (tenant_id);
create index if not exists idx_site_labour_project on public.aura_site_labour_allocations (project_id, date);

alter table public.aura_site_labour_allocations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_site_labour_allocations' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_site_labour_allocations
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- ============================================================
-- AURA OS — migration 0214: site installation records (the INSTALLED quantity strand)
-- ------------------------------------------------------------
-- An InstallationRecord captures physical work fixed in place on a project against a BOQ (measured)
-- item — a quantity installed on a date. It is the production measure behind progress: the Quantity
-- Ledger's Installed position (and, later, the WBS %). site.installation.recorded → +installed on
-- the Quantity Ledger. The gap Issued − Installed is wastage/WIP; Installed − Approved is the
-- inspection backlog. Owned by site.
-- ============================================================

create table if not exists public.aura_site_installations (
  id           uuid primary key,
  tenant_id    text not null,
  company_id   text,
  project_id   text not null,
  project_name text,
  boq_item_id  text not null,
  cbs_node_id  text,
  date         date not null,
  description  text not null,
  quantity     numeric(14,2) not null default 0,
  unit         text not null default 'nr',
  notes        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_site_install_tenant  on public.aura_site_installations (tenant_id);
create index if not exists idx_site_install_project on public.aura_site_installations (project_id, date);
create index if not exists idx_site_install_boq     on public.aura_site_installations (tenant_id, boq_item_id);

alter table public.aura_site_installations enable row level security;
alter table public.aura_site_installations force row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_site_installations' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_site_installations
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_site_installations;

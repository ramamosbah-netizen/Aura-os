-- ============================================================
-- AURA OS — migration 0111: Engineering BIM / model registry
-- ------------------------------------------------------------
-- Versioned catalogue of 3D/BIM model files (IFC/RVT/NWD/…) per project discipline — the data
-- backbone the in-browser model viewer consumes. Points at the stored file (object-store key /
-- URL); federation_group lets discipline models be loaded together in a coordination view.
-- ============================================================

create table if not exists public.aura_engineering_bim_models (
  id               uuid primary key,
  tenant_id        text not null,
  company_id       text,
  project_id       text not null,
  project_name     text,
  code             text not null,
  name             text not null,
  discipline       text not null default 'other',
  format           text not null default 'ifc',
  storage_key      text,
  file_url         text,
  version          integer not null default 1,
  revision         text not null default 'A',
  status           text not null default 'wip',
  file_size_bytes  bigint,
  federation_group text,
  notes            text,
  uploaded_by      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_eng_bim_tenant  on public.aura_engineering_bim_models (tenant_id);
create index if not exists idx_eng_bim_project on public.aura_engineering_bim_models (project_id, discipline);

alter table public.aura_engineering_bim_models enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_engineering_bim_models' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_engineering_bim_models
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

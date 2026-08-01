-- ============================================================
-- AURA OS — migration 0197: Commissioning (Test & Commission) register
-- ------------------------------------------------------------
-- The ELV deliverable that turns "installed" into "works and is accepted". One row per
-- system (or sub-system) being commissioned on a project, with the objective test-point
-- tally and the witnessed sign-off (consultant/client) that unlocks handover and the final
-- payment. Owned by the commissioning module; namespaced aura_commissioning_*.
-- ============================================================

create table if not exists public.aura_commissioning_records (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,
  project_id       uuid        not null,
  project_name     text,
  code             text        not null,
  title            text        not null,
  -- cctv | access_control | fire_alarm | pa_va | bms | network | intercom |
  -- structured_cabling | audio_visual | other
  system           text        not null default 'other',
  location         text,
  -- pending | in_progress | tested | commissioned | failed
  status           text        not null default 'pending',
  points_total     integer     not null default 0,
  points_passed    integer     not null default 0,
  test_date        date,
  remarks          text,
  commissioned_at  timestamptz,
  commissioned_by  text,
  witnessed_by     text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- The register's two read paths: by project, and the tenant-wide list.
create index if not exists idx_aura_commissioning_tenant
  on public.aura_commissioning_records (tenant_id, created_at desc);
create index if not exists idx_aura_commissioning_project
  on public.aura_commissioning_records (tenant_id, project_id);
create index if not exists idx_aura_commissioning_status
  on public.aura_commissioning_records (tenant_id, status);

-- Tenant isolation, the enforced way (0163/0164) — enabled, FORCED, and policied.
alter table public.aura_commissioning_records enable row level security;
alter table public.aura_commissioning_records force row level security;

drop policy if exists tenant_isolation on public.aura_commissioning_records;
create policy tenant_isolation on public.aura_commissioning_records
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_commissioning_records;

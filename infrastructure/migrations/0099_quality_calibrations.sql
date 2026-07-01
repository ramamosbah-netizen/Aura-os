-- ============================================================
-- AURA OS — migration 0099: Quality equipment calibration register
-- ------------------------------------------------------------
-- Tracks measuring-instrument calibration certificates + validity windows so QA can
-- prove equipment was in-calibration and flag instruments due/overdue for recalibration.
-- ============================================================

create table if not exists public.aura_quality_calibrations (
  id                 uuid primary key,
  tenant_id          text not null,
  company_id         text,
  project_id         text,
  project_name       text,
  equipment_name     text not null,
  equipment_serial   text not null,
  instrument_type    text,
  calibration_date   date not null,
  due_date           date not null,
  certificate_number text,
  calibrated_by      text,
  status             text not null default 'valid',
  notes              text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_quality_calibrations_tenant  on public.aura_quality_calibrations (tenant_id);
create index if not exists idx_quality_calibrations_due     on public.aura_quality_calibrations (tenant_id, due_date);
create index if not exists idx_quality_calibrations_project on public.aura_quality_calibrations (project_id);

alter table public.aura_quality_calibrations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_quality_calibrations' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_quality_calibrations
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

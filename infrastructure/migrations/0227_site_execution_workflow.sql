-- ============================================================
-- AURA OS — migration 0227: Site Execution workflow (G-34)
-- ------------------------------------------------------------
-- Turns the flat daily report into a governed site-execution record with typed line-items:
--   * aura_site_daily_reports gains the approval lifecycle stamps + report metadata. `status` stays
--     free-text (existing draft|submitted rows remain valid); the machine
--     (draft → submitted → under_review → approved|rejected → draft) is enforced in the domain.
--   * Five child line-item tables, each keyed by daily_report_id (WHO/WHAT/HOW MUCH, not a count):
--     labour, plant, installation progress (BOQ/WBS-linked), delays, and photo evidence
--     (a reference to object storage + metadata + hash — never the blob).
-- All tenant-isolated with FORCE RLS.
-- ============================================================

alter table public.aura_site_daily_reports add column if not exists report_number    text;
alter table public.aura_site_daily_reports add column if not exists site_conditions  text;
alter table public.aura_site_daily_reports add column if not exists safety_notes     text;
alter table public.aura_site_daily_reports add column if not exists prepared_by      text;
alter table public.aura_site_daily_reports add column if not exists submitted_by     text;
alter table public.aura_site_daily_reports add column if not exists submitted_at     timestamptz;
alter table public.aura_site_daily_reports add column if not exists reviewed_by      text;
alter table public.aura_site_daily_reports add column if not exists reviewed_at      timestamptz;
alter table public.aura_site_daily_reports add column if not exists approved_by      text;
alter table public.aura_site_daily_reports add column if not exists approved_at      timestamptz;
alter table public.aura_site_daily_reports add column if not exists rejection_reason text;

create table if not exists public.aura_site_report_labour (
  id uuid primary key, tenant_id text not null, company_id text, daily_report_id uuid not null, project_id text not null,
  created_by text, created_at timestamptz not null default now(),
  trade text not null, contractor text, headcount integer not null default 0, hours numeric not null default 0,
  man_hours numeric not null default 0, notes text
);

create table if not exists public.aura_site_report_plant (
  id uuid primary key, tenant_id text not null, company_id text, daily_report_id uuid not null, project_id text not null,
  created_by text, created_at timestamptz not null default now(),
  equipment_type text not null, equipment_id text, quantity integer not null default 1,
  operating_hours numeric not null default 0, status text not null default 'operational', notes text
);

create table if not exists public.aura_site_report_progress (
  id uuid primary key, tenant_id text not null, company_id text, daily_report_id uuid not null, project_id text not null,
  created_by text, created_at timestamptz not null default now(),
  activity_id text, boq_item_id text, description text not null, planned_qty numeric not null default 0,
  installed_qty numeric not null default 0, unit text, progress_pct numeric not null default 0, location text, notes text
);

create table if not exists public.aura_site_report_delays (
  id uuid primary key, tenant_id text not null, company_id text, daily_report_id uuid not null, project_id text not null,
  created_by text, created_at timestamptz not null default now(),
  category text not null, description text not null, duration_hours numeric not null default 0,
  responsible_party text, impact text, mitigation text
);

create table if not exists public.aura_site_report_evidence (
  id uuid primary key, tenant_id text not null, company_id text, daily_report_id uuid not null, project_id text not null,
  created_by text, created_at timestamptz not null default now(),
  file_id text not null, captured_at timestamptz, captured_by text, location text, description text,
  category text not null default 'progress', hash text
);

-- Index + FORCE-RLS tenant-isolation for every line table (idempotent).
do $$
declare t text;
begin
  foreach t in array array[
    'aura_site_report_labour', 'aura_site_report_plant', 'aura_site_report_progress',
    'aura_site_report_delays', 'aura_site_report_evidence'
  ] loop
    execute format('create index if not exists idx_%s_report on public.%s (tenant_id, daily_report_id)', t, t);
    execute format('alter table public.%s enable row level security', t);
    execute format('alter table public.%s force row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%s', t);
    execute format($p$create policy tenant_isolation on public.%s
      using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
      with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)$p$, t);
  end loop;
end $$;

-- @DOWN
drop table if exists public.aura_site_report_evidence;
drop table if exists public.aura_site_report_delays;
drop table if exists public.aura_site_report_progress;
drop table if exists public.aura_site_report_plant;
drop table if exists public.aura_site_report_labour;
alter table public.aura_site_daily_reports drop column if exists report_number;
alter table public.aura_site_daily_reports drop column if exists site_conditions;
alter table public.aura_site_daily_reports drop column if exists safety_notes;
alter table public.aura_site_daily_reports drop column if exists prepared_by;
alter table public.aura_site_daily_reports drop column if exists submitted_by;
alter table public.aura_site_daily_reports drop column if exists submitted_at;
alter table public.aura_site_daily_reports drop column if exists reviewed_by;
alter table public.aura_site_daily_reports drop column if exists reviewed_at;
alter table public.aura_site_daily_reports drop column if exists approved_by;
alter table public.aura_site_daily_reports drop column if exists approved_at;
alter table public.aura_site_daily_reports drop column if exists rejection_reason;

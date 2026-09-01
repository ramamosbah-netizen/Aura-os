-- AURA OS — migration 0275: PD-5B governed opening WBS BAC baseline
-- Additive only. Existing WBS rows remain unapproved/unknown until an explicit baseline command
-- captures their exact leaf allocations. No historical backfill is performed.

alter table public.aura_projects_projects
  add column if not exists wbs_baseline_id uuid,
  add column if not exists wbs_baseline_approved_at timestamptz,
  add column if not exists wbs_baseline_approved_by text,
  add column if not exists wbs_baseline_snapshot jsonb;

alter table public.aura_projects_wbs_nodes
  add column if not exists planned_value_known boolean not null default false;

create unique index if not exists uq_aura_projects_wbs_baseline_id
  on public.aura_projects_projects (tenant_id, wbs_baseline_id)
  where wbs_baseline_id is not null;

do $$ begin
  alter table public.aura_projects_projects
    add constraint aura_projects_wbs_baseline_evidence_ck
    check (
      (wbs_baseline_id is null and wbs_baseline_approved_at is null and wbs_baseline_approved_by is null and wbs_baseline_snapshot is null)
      or (wbs_baseline_id is not null and wbs_baseline_approved_at is not null and wbs_baseline_approved_by is not null and wbs_baseline_snapshot is not null)
    );
exception when duplicate_object then null;
end $$;

alter table public.aura_projects_projects enable row level security;
alter table public.aura_projects_wbs_nodes enable row level security;

-- @DOWN
alter table public.aura_projects_projects
  drop constraint if exists aura_projects_wbs_baseline_evidence_ck;
drop index if exists public.uq_aura_projects_wbs_baseline_id;
alter table public.aura_projects_wbs_nodes drop column if exists planned_value_known;
alter table public.aura_projects_projects
  drop column if exists wbs_baseline_snapshot,
  drop column if exists wbs_baseline_approved_by,
  drop column if exists wbs_baseline_approved_at,
  drop column if exists wbs_baseline_id;

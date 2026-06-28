-- ============================================================
-- AURA OS kernel — migration 0034: projection tracking & snapshots
-- ------------------------------------------------------------
-- Handles versioning checkpoints for read-model projections and
-- saves snapshot state payloads for event-sourced aggregates.
-- ============================================================

create table if not exists public.aura_projection_status (
  projection_name text        primary key,
  version         integer     not null,
  last_event_id   text,
  last_occurred_at timestamptz,
  rebuilding      boolean     not null default false,
  updated_at      timestamptz not null default now()
);

create table if not exists public.aura_snapshots (
  tenant_id       text        not null,
  aggregate_type  text        not null,
  aggregate_id    text        not null,
  version         integer     not null,
  state           jsonb       not null,
  created_at      timestamptz not null default now(),
  constraint pk_aura_snapshots primary key (tenant_id, aggregate_type, aggregate_id)
);

alter table public.aura_projection_status enable row level security;
alter table public.aura_snapshots enable row level security;

-- Projection status is global platform config; open to all active tenants
create policy global_projection_status_policy on public.aura_projection_status
  for all
  using (true);

-- Snapshots are isolated to active tenant
create policy tenant_snapshots_policy on public.aura_snapshots
  for all
  using (tenant_id = public.current_tenant_id());

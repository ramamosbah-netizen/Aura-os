-- ============================================================
-- AURA OS — migration 0222: ELV device register (gap register G-21 / G-23)
-- ------------------------------------------------------------
-- The record that makes this an *ELV* ERP. Until now a camera existed only as free text on a
-- BOQ line: nothing knew it hangs off a switch port, carries a serial the client signs for at
-- handover, or has a warranty the AMC is priced against.
--
-- One table, not a device schedule and a separate cable schedule — both are views over this.
-- Built as two tables you get two lists that disagree about how many cameras are on level 3.
--
-- The commissioning / handover / asset columns are SEAMS to the modules that already own those
-- stages, not a re-implementation of them. Owned by the elv module; namespaced aura_elv_*.
-- ============================================================

create table if not exists public.aura_elv_devices (
  id                       uuid        primary key,
  tenant_id                text        not null,
  company_id               text,
  project_id               uuid        not null,
  -- Canonical ELV system (shared/src/domain/elv-context.ts). Free text is the whole problem
  -- this replaces: "CCTV" typed six ways cannot be scheduled, counted or handed over.
  system                   text        not null default 'other',

  -- The tag on the drawing and on the physical label — CAM-L3-014. This, not the uuid, is what
  -- a site engineer reads out over the phone.
  tag                      text        not null,
  model                    text,
  manufacturer             text,
  location                 text,
  drawing_ref              text,

  -- Identity the client holds you to at handover.
  serial_number            text,
  mac_address              text,
  ip_address               text,

  -- Connectivity: the cable/port half of the schedule.
  cable_ref                text,
  home_run_to              text,
  port_ref                 text,

  -- planned | installed | terminated | tested | commissioned | faulty | removed
  status                   text        not null default 'planned',

  -- Seams to the stages other modules own.
  commissioning_record_id  uuid,
  warranty_expires_at      date,
  asset_id                 uuid,

  notes                    text,
  created_by               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- A device tag is unique within its project. Two CAM-L3-014s on one job is a data-entry
  -- error every time, and catching it here is cheaper than reconciling it at handover.
  constraint unq_aura_elv_device_tag unique (tenant_id, project_id, tag)
);

-- The register's read paths: the project schedule, the tenant-wide list, per-system filtering,
-- and the punch-list query (what is not yet commissioned).
create index if not exists idx_aura_elv_devices_tenant
  on public.aura_elv_devices (tenant_id, created_at desc);
create index if not exists idx_aura_elv_devices_project
  on public.aura_elv_devices (tenant_id, project_id);
create index if not exists idx_aura_elv_devices_system
  on public.aura_elv_devices (tenant_id, project_id, system);
create index if not exists idx_aura_elv_devices_status
  on public.aura_elv_devices (tenant_id, status);

-- Tenant isolation, the enforced way (0163/0164) — enabled, FORCED, and policied.
alter table public.aura_elv_devices enable row level security;
alter table public.aura_elv_devices force row level security;

drop policy if exists tenant_isolation on public.aura_elv_devices;
create policy tenant_isolation on public.aura_elv_devices
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_elv_devices;

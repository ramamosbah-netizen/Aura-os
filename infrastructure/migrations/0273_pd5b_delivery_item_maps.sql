-- AURA OS — migration 0273: PD-5B immutable frozen-item → WBS/CBS mappings
-- Additive only. Historical projects are intentionally not backfilled.

-- These tenant-qualified keys make the database enforce the same-project/same-tenant
-- relationship that the service validates. Existing primary keys make these indexes safe
-- (the tenant-qualified form is still required for a composite foreign key).
create unique index if not exists uq_aura_projects_projects_tenant_id_id
  on public.aura_projects_projects (tenant_id, id);
create unique index if not exists uq_aura_projects_wbs_tenant_project_id
  on public.aura_projects_wbs_nodes (tenant_id, project_id, id);
create unique index if not exists uq_aura_projects_cbs_tenant_project_id
  on public.aura_projects_cbs_nodes (tenant_id, project_id, id);

create table if not exists public.aura_projects_delivery_item_maps (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  project_id uuid not null,
  handover_id uuid not null,
  frozen_item_key text not null,
  source_kind text not null check (source_kind in ('DIRECT', 'TENDER')),
  source_id text,
  source_revision_ref text,
  source_item_id text,
  wbs_node_id uuid,
  cbs_node_id uuid,
  created_at timestamptz not null default now(),
  immutable_at timestamptz not null default now(),
  constraint aura_projects_delivery_item_maps_key_ck check (length(trim(frozen_item_key)) > 0),
  constraint aura_projects_delivery_item_maps_project_fk
    foreign key (tenant_id, project_id)
    references public.aura_projects_projects (tenant_id, id),
  constraint aura_projects_delivery_item_maps_wbs_fk
    foreign key (tenant_id, project_id, wbs_node_id)
    references public.aura_projects_wbs_nodes (tenant_id, project_id, id),
  constraint aura_projects_delivery_item_maps_cbs_fk
    foreign key (tenant_id, project_id, cbs_node_id)
    references public.aura_projects_cbs_nodes (tenant_id, project_id, id)
);

create unique index if not exists uq_aura_projects_delivery_item_maps_identity
  on public.aura_projects_delivery_item_maps (tenant_id, project_id, frozen_item_key);

create index if not exists ix_aura_projects_delivery_item_maps_handover
  on public.aura_projects_delivery_item_maps (tenant_id, handover_id);

create index if not exists ix_aura_projects_delivery_item_maps_wbs
  on public.aura_projects_delivery_item_maps (tenant_id, project_id, wbs_node_id)
  where wbs_node_id is not null;

create index if not exists ix_aura_projects_delivery_item_maps_cbs
  on public.aura_projects_delivery_item_maps (tenant_id, project_id, cbs_node_id)
  where cbs_node_id is not null;

alter table public.aura_projects_delivery_item_maps enable row level security;
alter table public.aura_projects_delivery_item_maps force row level security;

drop policy if exists aura_projects_delivery_item_maps_tenant_isolation
  on public.aura_projects_delivery_item_maps;

create policy aura_projects_delivery_item_maps_tenant_isolation
  on public.aura_projects_delivery_item_maps
  for all
  using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);

-- Frozen lineage is append-only. A trigger is required in addition to the application API
-- because the database owner can bypass RLS; no caller may mutate or delete a persisted map.
create or replace function public.prevent_aura_projects_delivery_item_map_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'delivery item mappings are immutable';
end;
$$;

drop trigger if exists aura_projects_delivery_item_maps_immutable
  on public.aura_projects_delivery_item_maps;
create trigger aura_projects_delivery_item_maps_immutable
  before update or delete on public.aura_projects_delivery_item_maps
  for each row execute function public.prevent_aura_projects_delivery_item_map_mutation();

-- @DOWN
drop trigger if exists aura_projects_delivery_item_maps_immutable
  on public.aura_projects_delivery_item_maps;
drop function if exists public.prevent_aura_projects_delivery_item_map_mutation();
drop policy if exists aura_projects_delivery_item_maps_tenant_isolation
  on public.aura_projects_delivery_item_maps;
drop index if exists public.ix_aura_projects_delivery_item_maps_cbs;
drop index if exists public.ix_aura_projects_delivery_item_maps_wbs;
drop index if exists public.ix_aura_projects_delivery_item_maps_handover;
drop index if exists public.uq_aura_projects_delivery_item_maps_identity;
drop table if exists public.aura_projects_delivery_item_maps;
drop index if exists public.uq_aura_projects_cbs_tenant_project_id;
drop index if exists public.uq_aura_projects_wbs_tenant_project_id;
drop index if exists public.uq_aura_projects_projects_tenant_id_id;

-- ============================================================
-- AURA OS — migration 0198: Handover packages
-- ------------------------------------------------------------
-- The project-level acceptance event that follows commissioning: the contractor compiles the
-- close-out deliverables (O&M manuals, as-builts, test certificates, warranty docs, training,
-- spares), submits them, and the client formally accepts — which starts the warranty/DLP clock
-- and is the trigger for AMC. One package per project. Owned by the commissioning module.
-- ============================================================

create table if not exists public.aura_handover_packages (
  id                    uuid        primary key,
  tenant_id             text        not null,
  company_id            text,
  project_id            uuid        not null,
  project_name          text,
  code                  text        not null,
  title                 text        not null,
  -- draft | submitted | accepted | rejected
  status                text        not null default 'draft',
  -- deliverables checklist: {omManuals, asBuilts, testCertificates, warrantyDocs, training, spares}
  checklist             jsonb       not null default '{}'::jsonb,
  submitted_at          timestamptz,
  accepted_at           timestamptz,
  client_representative  text,
  warranty_start_date   date,
  warranty_months       integer,
  remarks               text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_aura_handover_tenant
  on public.aura_handover_packages (tenant_id, created_at desc);
create index if not exists idx_aura_handover_project
  on public.aura_handover_packages (tenant_id, project_id);

-- Tenant isolation, the enforced way (0163/0164) — enabled, FORCED, and policied.
alter table public.aura_handover_packages enable row level security;
alter table public.aura_handover_packages force row level security;

drop policy if exists tenant_isolation on public.aura_handover_packages;
create policy tenant_isolation on public.aura_handover_packages
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_handover_packages;

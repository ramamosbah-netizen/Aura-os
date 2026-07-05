-- ============================================================
-- AURA OS — migration 0129: Engineering Design Changes
-- ------------------------------------------------------------
-- An engineering-originated design change (revised detail, value-engineering, site redesign),
-- owned by Engineering. When approved WITH a cost impact it EMITS engineering.design_change.approved;
-- the cross-module reactor creates the draft commercial Variation in Projects (ADR-0011 —
-- capabilities/modules compose via events, never a shared table). change_type mirrors the
-- variation vocabulary (addition/omission).
-- ============================================================

create table if not exists public.aura_engineering_design_changes (
  id               uuid primary key,
  tenant_id        text not null,
  company_id       text,
  code             text not null,
  title            text not null,
  description      text,
  discipline       text not null default 'other',
  change_type      text not null default 'addition',
  cost_impact      boolean not null default false,
  estimated_value  numeric(18,2) not null default 0,
  status           text not null default 'draft',
  project_id       text not null,
  project_name     text,
  owner_id         text,
  created_by       text,
  decided_by       text,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_eng_design_changes_tenant_project on public.aura_engineering_design_changes (tenant_id, project_id);
create index if not exists idx_eng_design_changes_status on public.aura_engineering_design_changes (tenant_id, status);
create index if not exists idx_eng_design_changes_discipline on public.aura_engineering_design_changes (tenant_id, discipline);

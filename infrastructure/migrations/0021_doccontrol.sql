-- ============================================================
-- AURA OS — migration 0021: Document Control Module
-- ------------------------------------------------------------
-- The document control module owns these tables.
-- Namespaced under aura_doccontrol_*. Apply with `pnpm db:migrate`.
-- ============================================================

-- 1. Transmittals
create table if not exists public.aura_doccontrol_transmittals (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  code         text        not null,
  title        text        not null,
  project_id   uuid        not null,
  project_name text,
  sender       text,
  recipient    text,
  status       text        not null default 'draft', -- draft | sent | received | acknowledged
  owner_id     text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, project_id, code)
);

create index if not exists idx_aura_dc_transmittals_project on public.aura_doccontrol_transmittals (tenant_id, project_id);
alter table public.aura_doccontrol_transmittals enable row level security;

-- 2. Correspondence Log (Letters, Memos, Inbound/Outbound)
create table if not exists public.aura_doccontrol_correspondence (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  code         text        not null,
  subject      text        not null,
  project_id   uuid        not null,
  project_name text,
  direction    text        not null,                -- inbound | outbound
  sender       text,
  recipient    text,
  status       text        not null default 'logged', -- logged | pending_review | closed
  owner_id     text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, project_id, code)
);

create index if not exists idx_aura_dc_correspondence_project on public.aura_doccontrol_correspondence (tenant_id, project_id);
alter table public.aura_doccontrol_correspondence enable row level security;

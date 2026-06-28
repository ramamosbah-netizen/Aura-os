-- ============================================================
-- AURA OS — migration 0018: Document Templates
-- ------------------------------------------------------------
-- The templates module OWNS this table.
-- Namespaced `aura_document_templates`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_document_templates (
  id           uuid        primary key,
  tenant_id    text        not null,
  name         text        not null,
  category     text        not null,
  elements     jsonb       not null default '[]'::jsonb,
  status       text        not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_aura_document_templates_tenant on public.aura_document_templates (tenant_id, created_at desc);

alter table public.aura_document_templates enable row level security;

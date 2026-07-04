-- ============================================================
-- AURA OS — migration 0130: Engineering Documents (one aggregate, many docTypes)
-- ------------------------------------------------------------
-- ADR-0011 point-6: Method Statement / Risk Assessment / Specification / Calc Sheet / Test Report /
-- Work Procedure are ONE aggregate discriminated by doc_type, sharing one lifecycle + revision +
-- the shared discipline dimension. Type-specific data lives in `fields` (jsonb — the form-engine
-- payload, ADR-0006 forms-are-JSON), so a new document type is a new form schema, not new code.
-- owner_module encodes ownership (HSE owns risk_assessment; Engineering owns the rest).
-- ============================================================

create table if not exists public.aura_engineering_documents (
  id             uuid primary key,
  tenant_id      text not null,
  company_id     text,
  code           text not null,
  title          text not null,
  doc_type       text not null,
  owner_module   text not null default 'engineering',
  discipline     text not null default 'other',
  status         text not null default 'draft',
  revision       text not null default 'A',
  fields         jsonb not null default '{}'::jsonb,
  project_id     text not null,
  project_name   text,
  owner_id       text,
  created_by     text,
  decided_by     text,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_eng_docs_tenant_project on public.aura_engineering_documents (tenant_id, project_id);
create index if not exists idx_eng_docs_type on public.aura_engineering_documents (tenant_id, doc_type);
create index if not exists idx_eng_docs_status on public.aura_engineering_documents (tenant_id, status);
create index if not exists idx_eng_docs_discipline on public.aura_engineering_documents (tenant_id, discipline);

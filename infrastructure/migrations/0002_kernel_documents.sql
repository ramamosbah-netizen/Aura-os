-- ============================================================
-- AURA OS kernel — migration 0002: Document Management substrate
-- ------------------------------------------------------------
-- Generic documents (Tender/Drawing/Submittal/Contract/Invoice…) attached to any
-- aggregate, with an append-only version history. Binary content lives in the
-- DocumentStorage backend (local FS now); these tables hold metadata only.
-- Namespaced `aura_*` (see 0001). Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_documents (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  kind            text        not null,
  title           text        not null,
  aggregate_type  text        not null,
  aggregate_id    text        not null,
  status          text        not null default 'active',
  current_version integer     not null default 1,
  created_by      text,
  created_at      timestamptz not null default now()
);

create table if not exists public.aura_document_versions (
  id            uuid        primary key,
  document_id   uuid        not null references public.aura_documents (id) on delete cascade,
  version       integer     not null,
  file_name     text        not null,
  content_type  text        not null,
  size_bytes    bigint      not null default 0,
  storage_key   text        not null,
  checksum      text,
  note          text,
  uploaded_by   text,
  uploaded_at   timestamptz not null default now(),
  unique (document_id, version)
);

create index if not exists idx_aura_documents_tenant    on public.aura_documents (tenant_id, created_at desc);
create index if not exists idx_aura_documents_aggregate on public.aura_documents (aggregate_type, aggregate_id);
create index if not exists idx_aura_documents_kind      on public.aura_documents (kind);
create index if not exists idx_aura_docver_document     on public.aura_document_versions (document_id, version desc);

-- Lock down: RLS on, no policies → only the service-role back-end (which bypasses
-- RLS) reads/writes. No client access.
alter table public.aura_documents          enable row level security;
alter table public.aura_document_versions  enable row level security;

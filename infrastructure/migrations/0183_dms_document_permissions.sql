-- ============================================================
-- AURA OS kernel — migration 0183: DMS document permissions (sharing)
-- ------------------------------------------------------------
-- Who, other than the uploader, may reach a document. Extends the 0002 DMS
-- substrate; composes with (never replaces) the RBAC grants in identity.
--
-- A SEPARATE TABLE, deliberately — not a `permissions jsonb` column on
-- aura_documents. Sharing needs audit: who granted it, when, when it expires,
-- who revoked it and when. A JSON blob can express the current state but not
-- the history, and "who gave the client access to this contract, and when did
-- we take it away" is exactly the question that gets asked.
--
-- Revocation is a soft delete (`revoked_at`) for the same reason: a deleted row
-- answers nothing afterwards.
-- ============================================================

create table if not exists public.aura_dms_document_permissions (
  id            uuid        primary key,
  tenant_id     text        not null,
  document_id   uuid        not null references public.aura_documents (id) on delete cascade,
  -- USER | TEAM | ROLE | COMPANY
  subject_type  text        not null,
  subject_id    text        not null,
  -- VIEW | DOWNLOAD | COMMENT | EDIT | SHARE | APPROVE
  permission    text        not null,
  granted_by    text,
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    text
);

-- The resolver's hot path: every live share on one document.
create index if not exists idx_aura_dms_perm_document
  on public.aura_dms_document_permissions (document_id)
  where revoked_at is null;

-- "Shared with me" — find a subject's live shares without scanning the table.
create index if not exists idx_aura_dms_perm_subject
  on public.aura_dms_document_permissions (tenant_id, subject_type, subject_id)
  where revoked_at is null;

-- One live grant per (document, subject, permission). A second identical share is
-- a no-op, not a duplicate row that then has to be revoked twice.
create unique index if not exists uq_aura_dms_perm_live
  on public.aura_dms_document_permissions (document_id, subject_type, subject_id, permission)
  where revoked_at is null;

-- Lock down: RLS on, no policies → only the service-role back-end (which bypasses
-- RLS) reads/writes, exactly as 0002 does for documents themselves.
alter table public.aura_dms_document_permissions enable row level security;

-- @DOWN
drop table if exists public.aura_dms_document_permissions;

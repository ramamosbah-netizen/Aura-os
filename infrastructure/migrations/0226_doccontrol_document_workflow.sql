-- ============================================================
-- AURA OS — migration 0225: Document Control document-approval workflow (G-33)
-- ------------------------------------------------------------
-- Adds the governed document-approval lifecycle + immutable revision history to the doc register,
-- and the transmittal acknowledgement audit trail.
--   * aura_doccontrol_document_revisions — one immutable row per revision of a register document,
--     walking draft → submitted → under_review → approved/rejected → issued → superseded. The
--     register entry is the header; these rows are the auditable approval journey + revision history.
--   * aura_doccontrol_transmittals gains sent_at/received_at/acknowledged_at stamps for its
--     enforced conveyance lifecycle.
--   * aura_doccontrol_transmittal_acks — immutable acknowledgement records (who/when/note).
-- All new tables carry tenant_id and are FORCE-RLS tenant-isolated.
-- ============================================================

create table if not exists public.aura_doccontrol_document_revisions (
  id                  uuid        primary key,
  tenant_id           text        not null,
  company_id          text,
  register_entry_id   uuid        not null,
  document_number     text        not null,
  project_id          text        not null,
  revision            text        not null,
  status              text        not null default 'draft',
  previous_revision   text,
  reason_for_revision text,
  submitted_by        text,
  submitted_at        timestamptz,
  reviewed_by         text,
  reviewed_at         timestamptz,
  decided_by          text,
  decided_at          timestamptz,
  decision_comments   text,
  issued_by           text,
  issued_at           timestamptz,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_doccontrol_doc_revisions_entry on public.aura_doccontrol_document_revisions (tenant_id, register_entry_id);

alter table public.aura_doccontrol_document_revisions enable row level security;
alter table public.aura_doccontrol_document_revisions force row level security;

drop policy if exists tenant_isolation on public.aura_doccontrol_document_revisions;
create policy tenant_isolation on public.aura_doccontrol_document_revisions
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- Transmittal conveyance stamps (additive; existing rows unaffected).
alter table public.aura_doccontrol_transmittals add column if not exists sent_at         timestamptz;
alter table public.aura_doccontrol_transmittals add column if not exists received_at     timestamptz;
alter table public.aura_doccontrol_transmittals add column if not exists acknowledged_at timestamptz;

create table if not exists public.aura_doccontrol_transmittal_acks (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,
  transmittal_id   uuid        not null,
  transmittal_code text        not null,
  acknowledged_by  text,
  acknowledged_at  timestamptz not null default now(),
  note             text
);

create index if not exists idx_doccontrol_transmittal_acks_tx on public.aura_doccontrol_transmittal_acks (tenant_id, transmittal_id);

alter table public.aura_doccontrol_transmittal_acks enable row level security;
alter table public.aura_doccontrol_transmittal_acks force row level security;

drop policy if exists tenant_isolation on public.aura_doccontrol_transmittal_acks;
create policy tenant_isolation on public.aura_doccontrol_transmittal_acks
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_doccontrol_transmittal_acks;
alter table public.aura_doccontrol_transmittals drop column if exists sent_at;
alter table public.aura_doccontrol_transmittals drop column if exists received_at;
alter table public.aura_doccontrol_transmittals drop column if exists acknowledged_at;
drop table if exists public.aura_doccontrol_document_revisions;

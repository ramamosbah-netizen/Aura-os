-- ============================================================
-- AURA OS kernel — migration 0184: document evidence requirements
-- ------------------------------------------------------------
-- What a decision REQUIRES, and whether it has been produced. Not an attachment
-- table: the evidence itself lives in the DMS (0002) or as an external reference.
-- This records the ASK and its settlement, which is what readiness is computed
-- from and what an approver is accountable to.
--
-- Evidence is a jsonb array on purpose, unlike document permissions in 0183.
-- The distinction: a permission is queried ACROSS documents ("what is shared with
-- me"), so it needs rows and indexes. Evidence is only ever read for the one
-- requirement that owns it, is small and bounded, and is never filtered on — a
-- child table would buy nothing and cost a join on every readiness read.
-- ============================================================

create table if not exists public.aura_document_requirements (
  id             uuid        primary key,
  tenant_id      text        not null,
  -- The thing that needs the evidence: 'crm.quotation' | 'crm.opportunity' | 'tendering.tender' …
  entity_type    text        not null,
  entity_id      text        not null,
  -- TECHNICAL_PROPOSAL | COMMERCIAL_OFFER | VENDOR_QUOTE | DATASHEET | DRAWING |
  -- METHOD_STATEMENT | WARRANTY_LETTER | COMPLIANCE_CERTIFICATE | OTHER
  type           text        not null,
  -- REQUIRED | PROVIDED | WAIVED | NOT_APPLICABLE
  status         text        not null default 'REQUIRED',
  -- Why this is a number and not a boolean: one of three vendor quotes is still a gap.
  required_count integer     not null default 1,
  evidence       jsonb       not null default '[]'::jsonb,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- The readiness read: every requirement on one record.
create index if not exists idx_aura_doc_req_entity
  on public.aura_document_requirements (entity_type, entity_id);

-- One requirement of a given type per record — asking for the same evidence twice is a
-- data-entry mistake, not two obligations.
create unique index if not exists uq_aura_doc_req_entity_type
  on public.aura_document_requirements (tenant_id, entity_type, entity_id, type);

-- Tenant isolation, the enforced way (0163/0164) — enabled, FORCED, and policied.
-- NOT the pre-R1 "enable RLS, no policy" pattern, which is deny-all under `aura_app`.
alter table public.aura_document_requirements enable row level security;
alter table public.aura_document_requirements force row level security;

drop policy if exists tenant_isolation on public.aura_document_requirements;
create policy tenant_isolation on public.aura_document_requirements
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_document_requirements;

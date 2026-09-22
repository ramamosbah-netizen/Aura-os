-- ============================================================
-- AURA OS — migration 0382: an inspection request that keeps its evidence
--                           (QHS-07 / XOP-12 — quality)
-- ------------------------------------------------------------
-- QUALITY HAS NEVER HAD A DOOR FOR A FILE.
--
-- Every multipart upload route in AURA lives in CRM, Tendering, DocControl and Site. Quality has
-- none, so an inspection request — the record that says a thing was looked at and passed — could
-- carry no photograph of what was looked at and no signature from whoever looked.
--
-- The screen has shown an "Inspector / Witness Signature" pad since it existed, bound to React
-- state that the submit payload never read. Same shape as the daily report before SIT-04 and the
-- handover acceptance before HO-06: the stroke is drawn, shown back to the person who drew it, and
-- discarded.
--
-- ------------------------------------------------------------
-- THE SAME TABLE SHAPE AS SITE EVIDENCE, DELIBERATELY.
--
-- An inspection produces the same two kinds of artefact a site diary does: photographs of what was
-- inspected, and a signature from whoever signed it off. Giving quality a differently-shaped
-- evidence row would mean two vocabularies for one idea and two places to get the signer/recorder
-- distinction wrong.
--
--   category            photo | signature | other — what the file IS, so no surface has to guess
--                       from a free-text description. The daily report's certificate used to pick
--                       its signature with a regex over the uploader's own words, and printed a
--                       progress photo described "sign-off" AS the signature.
--   signed_by           WHO SIGNED — a label. An inspection is witnessed by a consultant who holds
--                       no AURA account, so this is never a user id and never derived from
--                       `captured_by`.
--   captured_by         WHO UPLOADED / RECORDED IT.
--   signed_content_hash WHAT WAS SIGNED — the inspection RESULT at the moment of signing. An IR
--                       that is re-commented or re-measured afterwards must not keep printing the
--                       witness's signature beneath the new figures.
--
-- `inspected_by` on the IR itself already holds the AURA ACTOR who resolved it, and stays as it is.
-- It is the internal inspector; `signed_by` here is whoever actually signed, and the two are
-- different people whenever a consultant witnesses the inspection.
-- ============================================================

create table if not exists public.aura_quality_ir_evidence (
  id                  uuid        primary key,
  tenant_id           text        not null,
  company_id          text,
  inspection_id       uuid        not null,
  project_id          text        not null,
  file_id             text        not null,
  category            text        not null default 'photo',   -- photo | signature | other
  description         text,
  location            text,
  captured_at         timestamptz,
  -- WHO UPLOADED IT. Never presented as the signatory.
  captured_by         text,
  -- Tamper-evidence over the stored bytes, computed by the server.
  hash                text,
  -- SIGNATURE ROWS ONLY. Refused by the domain on any other category.
  signed_by           text,
  signed_content_hash text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_quality_ir_evidence_ir
  on public.aura_quality_ir_evidence (tenant_id, inspection_id);

alter table public.aura_quality_ir_evidence enable row level security;
alter table public.aura_quality_ir_evidence force row level security;
drop policy if exists tenant_isolation on public.aura_quality_ir_evidence;
create policy tenant_isolation on public.aura_quality_ir_evidence
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

comment on column public.aura_quality_ir_evidence.signed_by is
  'The person who SIGNED the inspection, as a label — a consultant witness holds no AURA account. Never derived from captured_by, which is who uploaded it. Required by the domain when category = ''signature'' and refused on any other category.';

comment on column public.aura_quality_ir_evidence.signed_content_hash is
  'sha256 of the inspection result this signature was given for. Computed server-side from the persisted IR, never accepted from the caller.';

-- @DOWN
drop table if exists public.aura_quality_ir_evidence;

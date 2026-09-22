-- ============================================================
-- AURA OS — migration 0376: the controlled document register held no document
--                           (DOC-CONTENT-01 — doccontrol)
-- ------------------------------------------------------------
-- `aura_doccontrol_document_revisions` carried TWENTY-TWO COLUMNS OF LIFECYCLE PROVENANCE and
-- nowhere to put the thing being governed:
--
--   submitted_by / submitted_at      who asked for it to be reviewed, and when
--   reviewed_by  / reviewed_at       who took it up
--   decided_by   / decided_at        who approved or rejected it, with comments
--   issued_by    / issued_at         who released it outside the company
--   revision, previous_revision, reason_for_revision, status
--
--   …and no column for the drawing.
--
-- So a revision could be submitted, reviewed, APPROVED and ISSUED to a client with no content
-- behind it. The register governed the lifecycle of a document it did not hold.
--
-- That is not a local gap. Everything downstream is built to REFERENCE a controlled document
-- rather than copy it — deliberately, and correctly: the O&M pack resolves `document_id` against
-- this register and comments that "the resolved document is attached for READING only — it is
-- never stored… a title shown here is the title the register has right now". The as-built
-- dossier and the transmittal do the same. Every one of them was resolving a number that had
-- nothing underneath it, which is why the audit recorded that browser lifecycles "mostly used
-- metadata or seeded references rather than a real uploaded binary".
--
-- ------------------------------------------------------------
-- A REFERENCE, NOT A COPY.
--
-- `dms_document_id` points at a DMS document. DocControl owns the lifecycle — who submitted,
-- who approved, who issued, and the immutability of an issued revision. DMS owns the bytes,
-- their versions, the checksum and who may download them. Keeping the file here as well would
-- give one document two homes and two answers to "who may read this", and the DMS access engine
-- is already the one place that answers it.
--
-- NULLABLE, and deliberately not backfilled. Every revision that exists today was created before
-- content could be attached; inventing a reference for them would be a guess written into a
-- reference column, exactly as migration 0334 declined to do for stock positions. A revision with
-- no content reads as what it is.
--
-- NO FOREIGN KEY to the DMS table. Documents are governed by their own access engine and are
-- soft-deletable through it; a hard FK would let DMS lifecycle decisions refuse a DocControl
-- write, coupling two registers that are deliberately separate. The reference is resolved on
-- read, the same way the O&M pack already resolves its own.
-- ============================================================

alter table public.aura_doccontrol_document_revisions
  add column if not exists dms_document_id text;

comment on column public.aura_doccontrol_document_revisions.dms_document_id is
  'DMS document holding this revision''s content. A reference, never a copy: DocControl owns the lifecycle, DMS owns the bytes and who may download them. Null for revisions created before content could be attached.';

-- Finding the revisions that carry a given document, and the ones that carry none, are both
-- ordinary questions for a register view. Partial, because most rows are null today.
create index if not exists idx_aura_doccontrol_revisions_dms_document
  on public.aura_doccontrol_document_revisions (tenant_id, dms_document_id)
  where dms_document_id is not null;

-- @DOWN
drop index if exists idx_aura_doccontrol_revisions_dms_document;
alter table public.aura_doccontrol_document_revisions drop column if exists dms_document_id;

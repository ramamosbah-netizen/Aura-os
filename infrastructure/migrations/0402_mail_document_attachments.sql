-- ============================================================
-- 0402 — A MAIL ATTACHES A GOVERNED DOCUMENT AT THE REVISION THAT WAS SENT (F-09)
--
-- aura_comms_attachments was built for this in 0237/0238 — owner_type 'mail', a document_id that
-- points at the DMS, never a second copy of the bytes — and nothing ever wrote a mail row into it.
-- The composer said attachments were "not yet wired", and that was true.
--
-- What a mail attachment is, now:
--   * a reference to ONE DMS document at ONE revision. The revision is pinned when the document is
--     attached: a later revision of the drawing does not change what this message carried, and the
--     recipient opens exactly what the sender attached;
--   * never a grant. Who may open it is the DMS's decision, made against the reader's own access
--     when they open it. Being on the envelope is necessary (nobody else can even reach the route)
--     and is not sufficient;
--   * once per message per document — attaching the same document twice is a mistake to refuse,
--     not a second attachment.
--
-- Chat attachments keep their shape: no document_id, no revision. The constraint below holds both
-- shapes — a document reference ALWAYS carries a positive revision, and a revision never appears
-- without a document.
-- ============================================================

alter table public.aura_comms_attachments
  add column if not exists document_version integer;

alter table public.aura_comms_attachments
  drop constraint if exists chk_aura_comms_attachment_document_revision;

alter table public.aura_comms_attachments
  add constraint chk_aura_comms_attachment_document_revision check (
    (document_id is null and document_version is null)
    or (document_id is not null and document_version is not null and document_version > 0)
  );

create unique index if not exists uq_aura_comms_attachments_mail_document
  on public.aura_comms_attachments (tenant_id, owner_id, document_id)
  where owner_type = 'mail' and document_id is not null;

-- @DOWN
drop index if exists public.uq_aura_comms_attachments_mail_document;
alter table public.aura_comms_attachments drop constraint if exists chk_aura_comms_attachment_document_revision;
alter table public.aura_comms_attachments drop column if exists document_version;

-- ============================================================
-- AURA OS — migration 0380: how the client accepted, and what proves it
--                           (HO-06 / XOP-12 — commissioning / handover)
-- ------------------------------------------------------------
-- 0378 gave the acceptance a captured signature. The rule that followed it is narrower and
-- stricter: an electronic signature is NOT mandatory — an acceptance signed on paper or confirmed
-- by email can be perfectly valid — but THE METHOD OF PROOF MUST BE EXPLICIT, and a `name-only`
-- acceptance may never be rendered as a signed or evidenced one.
--
--   electronic   the stored signature image and its reference
--   paper        a copy of the signed acceptance document
--   email        the message or document that proves the acceptance
--
-- So the two columns are renamed: what they hold is no longer necessarily a signature. A scanned
-- signed page is a signature; an emailed confirmation is not, and calling the column
-- `acceptance_signature_document_id` would have every surface reading it describe an email as a
-- signature — which is the same class of defect as the pad that discarded the stroke.
--
-- `acceptance_method` NULL means `name-only`: the acceptance was recorded against the
-- representative's name with no evidencing document. Those are real acceptances and they are kept.
-- What they may never do is produce a claim that somebody signed. The domain refuses a method
-- without evidence and evidence without a method, so the two can never disagree.
--
-- The rename is safe here because 0378 shipped in this same programme and nothing outside it reads
-- these columns; the data it wrote is electronic signatures, which is exactly what the backfill
-- below records.
-- ============================================================

alter table public.aura_handover_packages
  rename column acceptance_signature_document_id to acceptance_evidence_document_id;

alter table public.aura_handover_packages
  rename column acceptance_signature_hash to acceptance_evidence_hash;

alter table public.aura_handover_packages
  add column if not exists acceptance_method text;

-- BACKFILLED, and only where it can be known. Every row written by 0378 carries a captured
-- signature and nothing else could have produced one, so `electronic` is a fact about those rows
-- rather than a guess. Rows with no evidence document stay NULL — `name-only` — because inventing
-- a method for them is precisely what this migration exists to prevent.
update public.aura_handover_packages
   set acceptance_method = 'electronic'
 where acceptance_evidence_document_id is not null
   and acceptance_method is null;

comment on column public.aura_handover_packages.acceptance_method is
  'How the client accepted: electronic (a captured signature), paper (a scanned signed document) or email (the message that proves it). NULL is the legacy name-only acceptance — recorded against a representative''s name with no evidencing document, and never to be rendered as signed or evidenced.';

comment on column public.aura_handover_packages.acceptance_evidence_document_id is
  'The DMS document that evidences this acceptance, whatever its method. DMS owns the bytes and decides who may open them; this is the reference, never a copy. NULL only when acceptance_method is NULL.';

comment on column public.aura_handover_packages.acceptance_evidence_hash is
  'The checksum DMS computed for the evidence at rest. Computed by the server, never accepted from the caller.';

-- @DOWN
alter table public.aura_handover_packages drop column if exists acceptance_method;
alter table public.aura_handover_packages
  rename column acceptance_evidence_hash to acceptance_signature_hash;
alter table public.aura_handover_packages
  rename column acceptance_evidence_document_id to acceptance_signature_document_id;

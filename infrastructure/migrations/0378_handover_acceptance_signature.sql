-- ============================================================
-- AURA OS — migration 0378: the client's signature on the act that closes delivery
--                           (HO-06 — commissioning / handover)
-- ------------------------------------------------------------
-- The acceptance screen has shown the client a pad labelled "Client Representative Acceptance
-- Signature" for as long as the package has existed. It was bound to `onChange={() => {}}`. The
-- stroke was drawn, rendered back to the person who drew it, and discarded on the next render.
--
-- Acceptance is the contractual close: it is what starts the warranty and defects-liability clock
-- and what raises the AMC service contract. The only evidence it kept was `client_representative`
-- — free text, typed by the contractor's own user, naming somebody on the client side. The
-- printed certificate then asserted "signed acceptance signifies official system handover" over a
-- blank signature line, and nothing in the record could say whether anyone had signed at all.
--
-- ------------------------------------------------------------
-- THE BYTES DO NOT LIVE HERE.
--
-- The signature goes to DMS like every other file in this system: judged by the file-type policy
-- under the `signature` category (images and PDFs, magic bytes, never the declared name), owned by
-- the document access engine, and downloadable only by whoever may read the package it belongs to.
-- What this table keeps is the REFERENCE and the CHECKSUM — the same pair a daily report's
-- evidence keeps — so the certificate can show what was signed and a later reader can tell the
-- bytes have not moved underneath it.
--
-- A base64 column would have been less work and would have put an unscanned, ungoverned image
-- inside a business table, reachable by anything that can read the row.
--
-- NULLABLE and not backfilled. A package accepted before this column existed WAS accepted;
-- inventing a signature for it would be the more dishonest record. Null means "no signature was
-- captured", and the certificate is required to say that rather than imply one.
-- ============================================================

alter table public.aura_handover_packages
  add column if not exists acceptance_signature_document_id text,
  add column if not exists acceptance_signature_hash        text;

comment on column public.aura_handover_packages.acceptance_signature_document_id is
  'The DMS document holding the client representative''s signature for this acceptance. DMS owns the bytes and decides who may open them; this is the reference, never a copy. Null means no signature was captured.';

comment on column public.aura_handover_packages.acceptance_signature_hash is
  'The checksum DMS computed for the signature at rest, copied here so the acceptance record carries its own tamper-evidence. Computed by the server, never accepted from the caller.';

-- @DOWN
alter table public.aura_handover_packages
  drop column if exists acceptance_signature_hash,
  drop column if exists acceptance_signature_document_id;

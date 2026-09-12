-- ============================================================
-- AURA OS — migration 0302: the commissioning certificate, as a controlled document (TC-GATE-10)
-- ------------------------------------------------------------
-- THE LABEL THIS REMOVES.
--
-- Since TC-GATE-3 the Certificates & Records surface has said, in as many words:
--
--     Formal issue — DocControl — not linked
--
-- and the evidence-pack print view has carried the same admission. T&C can produce the evidence — the
-- test sheet, every run behind every point including the failures, the witnessed sign-off — and it
-- prints beautifully, but it is a SCREEN. It has no document number, no revision, no issue date and
-- no place in the register a client is handed at the end of a job. A dossier that cites it cites a
-- URL, not a document.
--
-- WHAT THIS IS NOT: a second document authority.
--
-- T&C does not create a register entry, does not assign a number, and does not issue anything. A
-- person registers the certificate in DOCUMENT CONTROL, where documents are registered, and then
-- says here: *this register entry is this system's commissioning certificate.* Exactly the shape of
-- the as-built link in 0301 and the ITP link in 0298 — the third time the answer to "these two
-- domains cannot be joined" has been an explicit, consumer-owned sentence rather than an inference.
--
-- ONE CERTIFICATE PER SYSTEM, and that is the difference from 0301. A system can legitimately have
-- several as-built drawings, so that table is unique on (system, document). A system has ONE
-- commissioning certificate; re-issuing it is a new REVISION of the same register entry, which
-- document control already models. So the uniqueness is on the SYSTEM alone, and linking a second
-- document to a system is refused rather than quietly producing two certificates for one sign-off.
--
-- A REFERENCE, NOT A COPY. `document_id` is all that is stored. Number, title, revision and status
-- are read from the register whenever they are shown, so a certificate that is superseded says so
-- instead of showing what was true on the day it was linked.
--
-- MUTABLE. Linking the wrong entry must be retractable, like every other link. What must never
-- change is what was SENT, which lives in the dossier manifest (0300) and has no UPDATE or DELETE
-- policy for exactly that reason.
--
-- NO BACKFILL. No commissioning record in this repository has ever had a controlled certificate —
-- that is the gap — so there is nothing to backfill from and any guess would invent one.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_commissioning_certificate_links (
  id               uuid        PRIMARY KEY,
  tenant_id        text        NOT NULL,
  company_id       text,
  commissioning_id uuid        NOT NULL,
  -- Denormalised so a project's certificates are one indexed read, matching the sibling link tables.
  project_id       text        NOT NULL,
  -- The DocControl register entry: its id, or the document number a person typed. Text, not a
  -- foreign key — this points ACROSS a module boundary, which ADR-0004 keeps out of the schema.
  document_id      text        NOT NULL,
  linked_by        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- ONE per system. See the header: a second certificate for one sign-off is not a richer record,
  -- it is an ambiguous one.
  CONSTRAINT aura_cx_certificate_links_uq UNIQUE (commissioning_id)
);

CREATE INDEX IF NOT EXISTS idx_cx_certificate_links_project
  ON public.aura_commissioning_certificate_links (tenant_id, project_id);

ALTER TABLE public.aura_commissioning_certificate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_commissioning_certificate_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.aura_commissioning_certificate_links;
CREATE POLICY tenant_isolation ON public.aura_commissioning_certificate_links
  FOR ALL
  USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

-- @DOWN
DROP TABLE IF EXISTS public.aura_commissioning_certificate_links;

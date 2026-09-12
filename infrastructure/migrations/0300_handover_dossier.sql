-- ============================================================
-- AURA OS — migration 0300: the handover dossier manifest (TC-GATE-7)
-- ------------------------------------------------------------
-- WHAT A DOSSIER IS HERE, AND WHAT IT DELIBERATELY IS NOT.
--
-- The dossier the client receives is an ASSEMBLY of evidence five domains already own: the
-- commissioning evidence pack per system (Testing & Commissioning), the O&M deliverables and the
-- client training record (Handover's own, TC-GATE-5), and the as-built drawings in the controlled
-- register (Document control, reached through the port added in TC-GATE-6).
--
-- So the dossier VIEW needs no table at all. It is derived on every read, and that is how it stays
-- true: nothing here can drift out of step with the domains it reports, because nothing here is a
-- copy of them.
--
-- THE ONE FACT NOBODY ELSE HOLDS.
--
-- A derived view always answers "what would we hand over TODAY". A dispute asks a different
-- question: "what did the client actually RECEIVE, and when?" Those two answers diverge the moment
-- anything moves — a document is superseded, a system is retested, a deliverable is withdrawn — and
-- re-deriving the pack would silently rewrite what was handed over. Nobody else can answer it: the
-- owning domains each hold their own current state, not the composition of a package at a moment.
--
-- This table is therefore a MANIFEST, captured when a package is SUBMITTED to the client, and it is
-- the only thing this gate stores.
--
-- IT STORES CITATIONS, NOT CONTENT.
--
-- Each row is a reference to a row in the owning domain, plus the label and state it carried AT
-- ISSUE. No document, no test result, no file. Keeping the label is a deliberate, minimal
-- duplication and the reason is the whole point of the table: "DOC-OM-014 rev B, accepted" is what
-- the client was handed, and re-reading DocControl next year would say "rev C, superseded" — a true
-- statement about today and a false one about the handover.
--
-- IMMUTABLE, ENFORCED HERE (the same model as the test-run lineage in migration 0296).
--
-- The policies below grant SELECT and INSERT and nothing else. With RLS enabled and no UPDATE or
-- DELETE policy, no row is VISIBLE to either command: the statement matches nothing and reports zero
-- rows affected rather than raising. A manifest that could be edited after issue would be worth
-- less than no manifest at all, because it would look like a record while being a draft.
--
-- ISSUES ARE NUMBERED. A rejected package that is reworked and resubmitted produces issue #2; #1
-- stays exactly as it was sent. This mirrors test runs: the history is the record, not the latest
-- state of it.
--
-- NO BACKFILL. A package submitted before this migration was submitted without a manifest, and
-- inventing one now from today's data would fabricate the very record this table exists to protect.
-- Those packages correctly show no captured issue, and the read model says so.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_handover_dossier_items (
  id           uuid        PRIMARY KEY,
  tenant_id    text        NOT NULL,
  company_id   text,
  handover_id  uuid        NOT NULL,
  -- Denormalised so a project's issued manifests are one indexed read.
  project_id   text        NOT NULL,
  issue_no     integer     NOT NULL,
  -- Which authority the cited row belongs to.
  kind         text        NOT NULL,
  -- The row in that authority. Text, not a foreign key: these point ACROSS module boundaries, and a
  -- database-level FK between modules is exactly the coupling ADR-0004 keeps out of the schema.
  source_id    text        NOT NULL,
  -- How a human finds it: a document number, a system code. Null where the authority has none.
  reference    text,
  -- What it was called, and what state it was in, AT ISSUE. See the header: this is the citation.
  label        text        NOT NULL,
  state        text,
  issued_at    timestamptz NOT NULL,
  issued_by    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_handover_dossier_items_kind_chk CHECK (
    kind IN ('commissioning_certificate', 'om_deliverable', 'training_session', 'as_built_document')
  ),
  CONSTRAINT aura_handover_dossier_items_issue_no_chk CHECK (issue_no >= 1),
  -- One citation per source row per issue: a concurrent double-capture fails loudly rather than
  -- quietly listing the same certificate twice in one dossier.
  CONSTRAINT aura_handover_dossier_items_uq UNIQUE (handover_id, issue_no, kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_handover_dossier_pkg
  ON public.aura_handover_dossier_items (tenant_id, handover_id, issue_no);
CREATE INDEX IF NOT EXISTS idx_handover_dossier_project
  ON public.aura_handover_dossier_items (tenant_id, project_id);

ALTER TABLE public.aura_handover_dossier_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_handover_dossier_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.aura_handover_dossier_items;
DROP POLICY IF EXISTS tenant_isolation_select ON public.aura_handover_dossier_items;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.aura_handover_dossier_items;

-- Read: same tenant, fail-closed when no tenant is bound.
CREATE POLICY tenant_isolation_select ON public.aura_handover_dossier_items
  FOR SELECT
  USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

-- Append: same tenant AND the manifest row must belong to a handover package of that same tenant,
-- so a citation cannot be attached to another tenant's package by supplying its id.
CREATE POLICY tenant_isolation_insert ON public.aura_handover_dossier_items
  FOR INSERT
  WITH CHECK (
    tenant_id::text = public.current_tenant_id()
    AND public.current_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.aura_handover_packages h
      WHERE h.id = handover_id AND h.tenant_id = tenant_id
    )
  );

-- NO UPDATE OR DELETE POLICY, ON PURPOSE. See the header: this is what makes an issued manifest a
-- record of what was sent rather than a description of what we would send now.

-- @DOWN
DROP TABLE IF EXISTS public.aura_handover_dossier_items;

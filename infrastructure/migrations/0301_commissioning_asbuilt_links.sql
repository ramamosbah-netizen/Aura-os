-- ============================================================
-- AURA OS — migration 0301: as-built drawings, linked to the system they document (TC-GATE-8)
-- ------------------------------------------------------------
-- THE WEAKNESS THIS CLOSES.
--
-- Since TC-GATE-6 Handover's as-built gate has read the controlled register and asked one question
-- of the whole project: "is there an entry marked as_built?" One drawing satisfied it for every
-- system. A ten-system project with a single as-built lift-lobby layout read READY, and the gate
-- said so in as many words — "1 as-built drawing in the register" — which is weak evidence dressed
-- as a pass.
--
-- WHY IT COULD NOT SIMPLY BE SPLIT PER SYSTEM.
--
-- Nothing joins the two sides. A register entry carries `discipline` (architectural | structural |
-- mep | elv | civil | other); a commissioning record carries the canonical `ElvSystem` (cctv,
-- access_control, fire_alarm, …). Every ELV system on a project has the SAME discipline, so
-- discipline cannot distinguish the CCTV as-built from the access-control one. Inferring the link
-- from a document number or a title would be a guess dressed as a fact, and a wrong guess here tells
-- a client that a system's as-built exists when what exists is a different system's drawing.
--
-- So the link is EXPLICIT and T&C-owned — the same shape, and for the same reason, as the ITP links
-- in migration 0298. A person says: *this register entry is this system's as-built.* DocControl
-- still owns the document; this table owns one sentence about it.
--
-- A REFERENCE, NOT A COPY. `document_id` is all that is stored — no number, no title, no revision,
-- no status. Those are read from the register at the moment they are needed (through the port added
-- in TC-GATE-6), so a drawing that is superseded or renumbered shows as superseded or renumbered
-- rather than as whatever was true on the day somebody linked it.
--
-- MUTABLE, UNLIKE THE MANIFEST IN 0300. A link is a statement about the present, and a statement
-- made in error must be retractable — linking the wrong drawing and being unable to unlink it would
-- be a worse record than none. What must never change is what was SENT, and that lives in the
-- dossier manifest, which has no UPDATE or DELETE policy precisely because it is a different kind of
-- fact.
--
-- NO BACKFILL. Nothing in the repository knows which drawing documents which system — that is the
-- gap this table exists to fill — so any backfill would be the guess the table was created to avoid.
-- Existing projects correctly read "no as-built drawing linked" until somebody says otherwise.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_commissioning_asbuilt_links (
  id               uuid        PRIMARY KEY,
  tenant_id        text        NOT NULL,
  company_id       text,
  commissioning_id uuid        NOT NULL,
  -- Denormalised so a project's links are one indexed read, matching the sibling link table.
  project_id       text        NOT NULL,
  -- The DocControl register entry: its id, or the document number a person typed. Text, not a
  -- foreign key — this points ACROSS a module boundary, and a database-level FK between modules is
  -- exactly the coupling ADR-0004 keeps out of the schema.
  document_id      text        NOT NULL,
  linked_by        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One row per (system, document). Linking the same drawing twice is refused rather than counted
  -- twice in the readiness chain.
  CONSTRAINT aura_cx_asbuilt_links_uq UNIQUE (commissioning_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_cx_asbuilt_links_record
  ON public.aura_commissioning_asbuilt_links (tenant_id, commissioning_id);
CREATE INDEX IF NOT EXISTS idx_cx_asbuilt_links_project
  ON public.aura_commissioning_asbuilt_links (tenant_id, project_id);

ALTER TABLE public.aura_commissioning_asbuilt_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_commissioning_asbuilt_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.aura_commissioning_asbuilt_links;
CREATE POLICY tenant_isolation ON public.aura_commissioning_asbuilt_links
  FOR ALL
  USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

-- @DOWN
DROP TABLE IF EXISTS public.aura_commissioning_asbuilt_links;

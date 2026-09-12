-- ============================================================
-- AURA OS — migration 0299: O&M deliverables and client training (TC-GATE-5)
-- ------------------------------------------------------------
-- TWO NEW AUTHORITIES, AND WHY THEY ARE NEW RATHER THAN BORROWED.
--
-- TC-GATE-4 turned two of Handover's six readiness items into projections and left four as
-- assertions, each labelled "nothing verifies this" because no authority existed to derive it from.
-- These two tables are the authorities for two of those four. Nobody else in the repository holds
-- either fact:
--
--   * O&M deliverables — whether the manuals, datasheets, maintenance schedule, spares list,
--     licences and contact list have been produced and ACCEPTED for a given system. DocControl owns
--     controlled documents; it does not own "is this system's O&M pack complete". Engineering owns
--     drawings; it does not own manuals.
--
--   * Client training and demonstration — that the client's own people were trained on a system and
--     acknowledged it. HSE's training is WORKER SAFETY training, a different authority about
--     different people, and conflating the two would let a toolbox talk stand in for handover
--     training.
--
-- WHAT THESE TABLES DELIBERATELY DO NOT HOLD: the documents themselves. `document_id` is a
-- REFERENCE into DocControl/Documents, never a copy — no title, no revision, no file. A second
-- document store is the thing this architecture forbids, and the reference keeps the controlled copy
-- exactly where it is controlled.
--
-- Both are scoped to a COMMISSIONING RECORD — the system — because that is the unit an O&M pack and
-- a training session are actually about. Training may also be project-wide, so its link is nullable.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_handover_om_items (
  id               uuid        PRIMARY KEY,
  tenant_id        text        NOT NULL,
  company_id       text,
  project_id       text        NOT NULL,
  /** The system this deliverable belongs to (a commissioning record). */
  commissioning_id uuid        NOT NULL,
  /** Canonical deliverable key — see domain/om-deliverable.ts. Never free text. */
  deliverable      text        NOT NULL,
  /** A deliverable that does not apply to this system is marked not required, not quietly skipped. */
  required         boolean     NOT NULL DEFAULT true,
  state            text        NOT NULL DEFAULT 'required',
  /** Reference to the controlled document in DocControl. A reference, never a copy. */
  document_id      text,
  notes            text,
  submitted_at     timestamptz,
  submitted_by     text,
  reviewed_at      timestamptz,
  reviewed_by      text,
  accepted_at      timestamptz,
  accepted_by      text,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_handover_om_state_chk CHECK (state IN ('required', 'submitted', 'reviewed', 'accepted')),
  -- One row per deliverable per system. Two rows for "O&M manual" on one system would make
  -- "is the pack complete" unanswerable.
  CONSTRAINT aura_handover_om_uq UNIQUE (commissioning_id, deliverable)
);

CREATE INDEX IF NOT EXISTS idx_handover_om_project ON public.aura_handover_om_items (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_handover_om_system ON public.aura_handover_om_items (tenant_id, commissioning_id);

ALTER TABLE public.aura_handover_om_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_handover_om_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.aura_handover_om_items;
CREATE POLICY tenant_isolation ON public.aura_handover_om_items
  FOR ALL
  USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

-- ── Client training and demonstration ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.aura_handover_training_sessions (
  id                      uuid        PRIMARY KEY,
  tenant_id               text        NOT NULL,
  company_id              text,
  project_id              text        NOT NULL,
  /** The system trained on. NULL for training that covers the project rather than one system. */
  commissioning_id        uuid,
  title                   text        NOT NULL,
  topics                  text,
  trainer                 text,
  session_date            date,
  duration_minutes        integer,
  /** The client's own attendees, as recorded on the attendance sheet. */
  attendees               text,
  /** A demonstration is not the same as a talk: recorded separately because clients ask. */
  demonstration_completed boolean     NOT NULL DEFAULT false,
  state                   text        NOT NULL DEFAULT 'planned',
  acknowledged_by         text,
  acknowledged_at         timestamptz,
  /** Reference to the training material in DocControl. A reference, never a copy. */
  material_document_id    text,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_handover_training_state_chk CHECK (state IN ('planned', 'completed', 'acknowledged')),
  CONSTRAINT aura_handover_training_duration_chk CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

CREATE INDEX IF NOT EXISTS idx_handover_training_project ON public.aura_handover_training_sessions (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_handover_training_system ON public.aura_handover_training_sessions (tenant_id, commissioning_id)
  WHERE commissioning_id IS NOT NULL;

ALTER TABLE public.aura_handover_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_handover_training_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.aura_handover_training_sessions;
CREATE POLICY tenant_isolation ON public.aura_handover_training_sessions
  FOR ALL
  USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

-- @DOWN
DROP TABLE IF EXISTS public.aura_handover_training_sessions;
DROP TABLE IF EXISTS public.aura_handover_om_items;

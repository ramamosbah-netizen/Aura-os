-- ============================================================
-- AURA OS — migration 0332: a transmittal goes to PEOPLE, and only they can say it arrived.
-- ------------------------------------------------------------
-- A controlled document conveyance had one `recipient` column holding free text, and an
-- acknowledgement anybody could make. Between them they leave two things unprovable, and they are
-- exactly the two ENG-05 and ENG-06 ask for:
--
--   WHO IT WENT TO. A release reaches a Site Engineer, a Project Engineer and a Buyer — three
--   named people with different reasons for needing it. One text field holds one of them, badly:
--   "Site team", "M. Hassan", "site@contractor.ae" are all it can say, and none resolves to
--   anybody the system can check.
--
--   WHO SAID IT ARRIVED. `acknowledgeTransmittal` asserted a permission and recorded the actor —
--   so any holder of `doccontrol.transmittal.acknowledge` on the project could acknowledge any
--   transmittal, including one addressed to somebody else. A receipt signed by a person who was
--   never sent the document is not a receipt; it is a second person's opinion that it probably
--   arrived.
--
-- So recipients become ROWS, each naming a platform user and the capacity they receive in, and each
-- carrying its OWN acknowledgement. A named recipient acknowledges for themselves and for nobody
-- else.
--
-- PARTIAL RECEIPT IS NOT RECEIPT. The transmittal reaches `acknowledged` only when EVERY named
-- recipient has acknowledged; one person confirming does not let the conveyance report that three
-- people have it. Until then the per-recipient receipts are the truth, and they are visible
-- individually — "the Buyer has it, Site has not" is the fact a document controller actually needs,
-- and collapsing it into one status is how a chase goes to the wrong person.
--
-- `recipient` stays as free text on the transmittal: conveyances raised before this have nothing
-- else, and deleting the only addressee a historical record carries would destroy the link rather
-- than improve it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_doccontrol_transmittal_recipients (
  id               uuid PRIMARY KEY,
  tenant_id        text NOT NULL,
  company_id       text,
  project_id       text NOT NULL,
  transmittal_id   uuid NOT NULL
    REFERENCES public.aura_doccontrol_transmittals (id) ON DELETE CASCADE,
  -- The platform account this conveyance is addressed to. Canonical, because "only the recipient
  -- may acknowledge" is unenforceable against a typed name.
  user_id          text NOT NULL,
  /**
   * WHY this person is on the distribution: site_engineer, project_engineer, procurement,
   * consultant, client, other. The capacity they receive in, not their job title — the same person
   * can be on one transmittal as the Project Engineer and on another as the reviewer.
   */
  party            text NOT NULL DEFAULT 'other',
  acknowledged_at  timestamptz,
  acknowledged_note text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One person is addressed once per conveyance. Naming them twice is not a stronger delivery, and
  -- every count of "who has acknowledged" would read them as two.
  CONSTRAINT aura_doccontrol_transmittal_recipients_unique UNIQUE (transmittal_id, user_id),
  CONSTRAINT aura_doccontrol_transmittal_recipients_user CHECK (length(btrim(user_id)) > 0),
  -- A receipt is a whole fact: a note with no time records nothing.
  CONSTRAINT aura_doccontrol_transmittal_recipients_ack CHECK (
    acknowledged_at IS NOT NULL OR acknowledged_note IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_transmittal_recipients_transmittal
  ON public.aura_doccontrol_transmittal_recipients (tenant_id, transmittal_id);
-- What is waiting on a given person, across the project: the question a chase starts from.
CREATE INDEX IF NOT EXISTS idx_transmittal_recipients_user
  ON public.aura_doccontrol_transmittal_recipients (tenant_id, user_id, acknowledged_at);

-- ENABLE and FORCE, because FORCE is what binds a non-superuser owner; without it an
-- owner-connected proof passes vacuously.
ALTER TABLE public.aura_doccontrol_transmittal_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_doccontrol_transmittal_recipients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_doccontrol_transmittal_recipients;
CREATE POLICY tenant_isolation_policy ON public.aura_doccontrol_transmittal_recipients
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON public.aura_doccontrol_transmittal_recipients TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_doccontrol_transmittal_recipients;

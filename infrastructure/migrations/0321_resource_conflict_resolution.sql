-- ============================================================
-- AURA OS — migration 0321: who is dealing with this conflict, and what they decided.
-- ------------------------------------------------------------
-- A resource conflict has never been a row, and this migration does not make it one. Feasibility
-- is DERIVED on every read — from capacity, from every project's held bookings, and since 0317-0320
-- from what HR, Fleet and Assets say — precisely because a stored verdict is a verdict as of the
-- last time somebody remembered to recompute it (see 0288's note). None of that changes here.
--
-- What was missing is not a record of the conflict. It is a record of the PEOPLE:
--
--     the conflict      derived, never stored, true or false right now
--     the ownership     a named person took it on          -> STORED, here
--     the decision      what they did about it             -> STORED, here
--
-- Before this, a surfaced conflict was everybody's to see and nobody's to fix. Two planners could
-- each assume the other was on it, and the only evidence that anything had been done was the
-- conflict eventually disappearing — which says nothing about whether somebody resolved it or the
-- dates simply moved underneath it.
--
-- CLOSING A ROW HERE DOES NOT CLEAR THE CONFLICT, and that is the point rather than a limitation.
-- The verdict still comes from the facts. If an owner records that they have resolved something
-- and the conflict is still there on the next read, the screen says BOTH — owned, marked resolved,
-- still conflicted — which is the honest state and the one worth seeing. A flag that could silence
-- a derived truth would be the same mistake as a `feasible` column, arriving through a side door.
--
-- KEYED BY RESOURCE AND WINDOW, not by a conflict id, because a conflict has no stable identity: a
-- clash on Tuesday and Wednesday becomes a clash on Tuesday when one booking moves, and an id
-- minted for the first would orphan the moment the facts shifted. An owner takes on a RESOURCE for
-- a PERIOD, which is a thing a person can actually be accountable for.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_resource_conflict_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,

  -- The resource whose conflicts are being taken on. A ResourceRef, stored as its two parts, so
  -- identity stays TYPED: a vehicle and an asset sharing a uuid are two resources.
  resource_type text NOT NULL,
  canonical_resource_id text NOT NULL,
  -- Inclusive. The period the owner is accountable for, not the conflict's current day set.
  valid_from date NOT NULL,
  valid_to date NOT NULL,

  -- The named person. Not derived from who happened to book it: a conflict between two projects
  -- belongs to whoever governs the shared resource, which is a decision somebody makes.
  owner_id text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by text,

  -- owned | resolved | accepted. `accepted` is DG-22.8's language: the exposure is taken on
  -- knowingly, which is a real outcome and must not be recorded as if it had been fixed.
  status text NOT NULL DEFAULT 'owned',
  -- What they actually did. Required to close, for the same reason releasing capacity is.
  decision text,
  decided_at timestamptz,
  decided_by text,

  CONSTRAINT aura_projects_resource_conflict_type_check
    CHECK (resource_type IN ('employee', 'vehicle', 'asset', 'pool')),
  CONSTRAINT aura_projects_resource_conflict_status_check
    CHECK (status IN ('owned', 'resolved', 'accepted')),
  CONSTRAINT aura_projects_resource_conflict_range_check
    CHECK (valid_to >= valid_from),
  -- A closed entry says what was done and when; an open one must not pretend to.
  CONSTRAINT aura_projects_resource_conflict_decision_check
    CHECK ((status = 'owned') = (decided_at IS NULL)),
  CONSTRAINT aura_projects_resource_conflict_decision_text_check
    CHECK (status = 'owned' OR btrim(coalesce(decision, '')) <> '')
);

-- ONE OPEN OWNERSHIP PER RESOURCE. "Who is dealing with this crane?" must have one answer; two
-- open rows would let two people each believe the other was on it, which is the state this table
-- exists to end. A different period needs the current one closed first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_aura_projects_resource_conflict_open
  ON public.aura_projects_resource_conflict_resolutions (tenant_id, resource_type, canonical_resource_id)
  WHERE status = 'owned';

-- The read on every planning desk: what is owned right now, for these resources.
CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_conflict_resource
  ON public.aura_projects_resource_conflict_resolutions (tenant_id, resource_type, canonical_resource_id, valid_from, valid_to);

-- ── Row-level security ─────────────────────────────────────────────────────
-- Tenant-level, like the pools and capacity it concerns: these rows have no parent project — a
-- conflict is precisely the thing that spans them. ENABLE and FORCE, because FORCE is what binds a
-- non-superuser owner and without it an owner-connected proof passes vacuously.
ALTER TABLE public.aura_projects_resource_conflict_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_resource_conflict_resolutions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_resource_conflict_resolutions;
CREATE POLICY tenant_isolation_policy ON public.aura_projects_resource_conflict_resolutions
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_resource_conflict_resolutions TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_projects_resource_conflict_resolutions;

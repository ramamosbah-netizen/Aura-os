-- ============================================================
-- AURA OS — migration 0319: who is actually IN a pool.
-- ------------------------------------------------------------
-- A pool has always been a countable quantity — "2 crews", "40 hours" — with nobody named inside
-- it. That is enough to detect that two projects claimed the same crew on the same Tuesday, and
-- not enough to tell any of the people in that crew where they are expected to be.
--
-- MEMBERSHIP IS NOT CAPACITY, and the two must never be read as one another:
--
--     capacity     how MUCH of this pool is available   (2 crews)
--     membership   WHO belongs to it                    (12 named electricians)
--
-- A crew of twelve that can field two crews at once is an ordinary arrangement, not a
-- contradiction, so this table imposes no arithmetic relationship with `aura_projects_resource_
-- capacity`. Anything that derived one from the other would be inventing a rule nobody stated —
-- and the first ELV contractor with a 12-person crew fielding 2 teams would find their capacity
-- silently rewritten to 12.
--
-- WHAT THIS DOES NOT MAKE TRUE. A booking of "1 crew" is not a claim on any single named member's
-- time. Membership therefore tells a member that THEIR CREW is committed; it does not book them
-- personally, and nothing here may be turned into a personal allocation without a planner or a
-- supervisor naming who actually goes. That distinction is the whole reason a pool booking carries
-- no accept/decline for an individual: one member's refusal is not the crew's answer.
--
-- No foreign key to HR (ADR-0004: Projects references, it does not import). `employee_id` is the
-- id in HR's register, checked against the canonical catalogue at the service boundary, exactly as
-- a task requirement's employee reference is.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_resource_pool_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  pool_id uuid NOT NULL REFERENCES public.aura_projects_resource_pools(id) ON DELETE CASCADE,
  -- The employee's id in HR. A reference, never a copy of their name or trade: a renamed person is
  -- renamed everywhere, and no second master exists to drift.
  employee_id uuid NOT NULL,
  -- Provenance for a statement about a person's working arrangements.
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text,
  -- Soft removal. The row survives so "who was in this crew" stays answerable; `removed_at`
  -- decides who is in it NOW, which is the only question a forward-looking work list asks.
  removed_at timestamptz,
  removed_by text
);

-- One ACTIVE membership per person per pool. A second live row would double the crew on every
-- read that counts members, and leave "remove them" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_aura_projects_resource_pool_members_active
  ON public.aura_projects_resource_pool_members (tenant_id, pool_id, employee_id)
  WHERE removed_at IS NULL;

-- The read on the My Work path: which pools is this person in?
CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_pool_members_employee
  ON public.aura_projects_resource_pool_members (tenant_id, employee_id)
  WHERE removed_at IS NULL;

-- And the roster read: who is in this pool?
CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_pool_members_pool
  ON public.aura_projects_resource_pool_members (tenant_id, pool_id)
  WHERE removed_at IS NULL;

-- ── Row-level security ─────────────────────────────────────────────────────
-- Tenant-level, like the pool it belongs to: these rows have no parent project. ENABLE and FORCE,
-- because FORCE is what binds a non-superuser owner and without it an owner-connected proof passes
-- vacuously.
ALTER TABLE public.aura_projects_resource_pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_resource_pool_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_resource_pool_members;
CREATE POLICY tenant_isolation_policy ON public.aura_projects_resource_pool_members
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_resource_pool_members TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_projects_resource_pool_members;

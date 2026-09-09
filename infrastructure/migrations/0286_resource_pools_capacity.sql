-- ============================================================
-- AURA OS — migration 0286: §22 Step 4 — resource pools and capacity
-- ------------------------------------------------------------
-- THESE TABLES ARE NOT PROJECT-SCOPED, and that is the point.
--
-- Design Gate §3.1, normative: `ResourcePool` is an organization-scoped planning authority,
-- implemented within the Projects bounded implementation because Resource Planning is its only
-- proven consumer. It is NOT project-owned and carries NO project_id. A Rule-of-Three review is
-- required when another bounded context becomes a genuine consumer.
--
-- A pool scoped to a project could never answer the question §22 exists for — the same crew
-- committed on two sites next Tuesday — because each project would hold a private copy of the same
-- twelve electricians and each would truthfully report them free.
--
--        ResourcePool  (tenant / org scoped)
--             ├── Project A bookings
--             └── Project B bookings
--
-- CONSEQUENCE FOR RLS. Every other aura_projects_* table isolates by joining its parent project.
-- These have no parent project to join, so the policy is tenant-level. That is not a weaker policy
-- copied carelessly; it is the correct one for a row that genuinely belongs to the tenant rather
-- than to a project, and writing the project-join policy here would have required inventing a
-- project_id whose only purpose was to satisfy a template.
--
-- QUANTITY IS NULLABLE, AND NULL MEANS UNKNOWN. Not zero — a declared zero is a different and
-- knowable fact that yields CONFLICTED against demand — and not unlimited. The previous planner
-- turned an absent capacity into Infinity, reported `overallocated: false`, and told two projects a
-- booked crane was free. A column that cannot express "nobody has said" recreates that.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_resource_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  -- hours | persons | crews | units. Fixed at creation: changing it reinterprets every booking
  -- ever made against the pool.
  unit text NOT NULL,
  source_type text NOT NULL DEFAULT 'internal',   -- internal | subcontractor
  -- The supplier a subcontracted crew belongs to. PROVENANCE, never identity: one subcontractor
  -- fields several crews, so supplier_id can never be a pool's primary key. No foreign key,
  -- deliberately — Supplier lives in Procurement and a cross-module FK would couple two modules'
  -- migrations, the same reasoning as §21's issue references.
  source_id uuid,
  -- The organisational node this pool belongs to (DG-22.9). NULL = tenant-wide, stated rather than
  -- assumed. Deliberately NOT branch_id: that is a bare text column with no register, no name and
  -- no parent, recorded as AURA-ORG-001 and routed around rather than built upon.
  org_node_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_projects_resource_pools_unit_check
    CHECK (unit IN ('hours', 'persons', 'crews', 'units')),
  CONSTRAINT aura_projects_resource_pools_source_check
    CHECK (source_type IN ('internal', 'subcontractor')),
  -- A subcontracted crew with nobody behind it cannot be traced to anyone, and the reason to
  -- record a source at all is that shared capacity has an accountable owner.
  CONSTRAINT aura_projects_resource_pools_subcontract_check
    CHECK (source_type <> 'subcontractor' OR source_id IS NOT NULL),
  -- One pool of a given name per scope. Two "Electricians" in one org node are one pool recorded
  -- twice, and their capacities would then be counted independently — the exact double-count §22
  -- exists to prevent, arriving through the register instead of through a booking.
  --
  -- NULLS NOT DISTINCT is load-bearing, not decoration. `org_node_id` is NULL for a tenant-wide
  -- pool, and under SQL's default NULL semantics a plain UNIQUE would treat every tenant-wide row
  -- as distinct from every other — so the constraint would guard scoped pools and silently permit
  -- unlimited duplicates of exactly the common case. A live proof caught this; the DDL read fine.
  CONSTRAINT uq_aura_projects_resource_pools_name
    UNIQUE NULLS NOT DISTINCT (tenant_id, org_node_id, name)
);

CREATE TABLE IF NOT EXISTS public.aura_projects_resource_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  -- A ResourceRef, stored as its two parts. NEVER as one composite string: two columns are what
  -- let the database index a reference and let a query group by type.
  resource_type text NOT NULL,             -- employee | vehicle | asset | pool
  canonical_resource_id text NOT NULL,
  unit text NOT NULL,
  -- NULL = UNKNOWN. Not 0, which is a real declared fact, and not a sentinel for unlimited.
  quantity numeric,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  -- Which working calendar the quantity is expressed against. @aura/core owns calendars; no FK,
  -- because that table belongs to the kernel and this is a reference, not ownership.
  calendar_id text,
  org_node_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT aura_projects_resource_capacity_type_check
    CHECK (resource_type IN ('employee', 'vehicle', 'asset', 'pool')),
  CONSTRAINT aura_projects_resource_capacity_unit_check
    CHECK (unit IN ('hours', 'persons', 'crews', 'units')),
  CONSTRAINT aura_projects_resource_capacity_quantity_check
    CHECK (quantity IS NULL OR quantity >= 0),
  CONSTRAINT aura_projects_resource_capacity_interval_check
    CHECK (valid_to >= valid_from)
);

-- Overlapping windows are ALLOWED and summed: two hire periods for the same crane genuinely give
-- two cranes that week. What the domain refuses is summing across units, which is why there is no
-- constraint here forcing one unit per resource — a resource may legitimately be measured
-- differently in different periods, and `capacityOn` reports UNIT_CONFLICT rather than adding them.

CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_pools_tenant
  ON public.aura_projects_resource_pools (tenant_id);
-- The lookup every conflict check makes: this resource, this date range.
CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_capacity_resource
  ON public.aura_projects_resource_capacity (tenant_id, resource_type, canonical_resource_id, valid_from, valid_to);

-- ── Row-level security ─────────────────────────────────────────────────────
-- Tenant-level, because these rows have no parent project — see the header. ENABLE and FORCE, per
-- the current standard: FORCE is what binds a non-superuser owner, and without it a proof run from
-- an owning connection passes vacuously.

ALTER TABLE public.aura_projects_resource_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_resource_pools FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_resource_pools;
CREATE POLICY tenant_isolation_policy ON public.aura_projects_resource_pools
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

ALTER TABLE public.aura_projects_resource_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_resource_capacity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_resource_capacity;
CREATE POLICY tenant_isolation_policy ON public.aura_projects_resource_capacity
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_resource_pools TO aura_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_resource_capacity TO aura_app;

-- @DOWN
-- Capacity goes first: it references pools by id without a foreign key (a capacity may describe an
-- employee or an asset just as well as a pool), so dropping pools first would leave capacity rows
-- pointing at nothing for as long as the rollback took.
DROP TABLE IF EXISTS public.aura_projects_resource_capacity;
DROP TABLE IF EXISTS public.aura_projects_resource_pools;

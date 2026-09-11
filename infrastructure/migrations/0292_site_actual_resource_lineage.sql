-- ============================================================
-- AURA OS — migration 0292: AURA-PM-002 — site actuals carry a stable resource reference
-- ------------------------------------------------------------
-- Site's actual usage named the resource it consumed only in free text: PlantUsage.equipment was a
-- "description or asset code", and LabourAllocation.subcontractor_name a plain name. So "TC-01",
-- "Tower Crane TC-01" and "Tower crane 1" were three resources, and a plan that booked
-- Asset:9f3c… could never be matched against the day it was actually used. §22 could answer "is this
-- crane double-booked?" (planning-side, on stable ids) but not "did we use the crane we planned?".
--
-- These nullable columns give the actuals the same stable reference the plan already uses, so
-- plan-vs-actual reconciliation becomes deterministic:
--
--   aura_site_plant_usage.resource_type / resource_id  — mirrors §22 ResourceRef's stored form
--     (type + id in the owning register). 'asset' → Assets Asset, 'vehicle' → Fleet Vehicle. A
--     CHECK keeps them both-or-neither: a type without an id matches nothing, an id without a type is
--     ambiguous between the two registers.
--   aura_site_labour_allocations.subcontractor_id     — the Procurement Supplier the labour came
--     from (category 'subcontractor'). `trade` stays free text: no trade register exists to point at.
--
-- All NULL for usage logged without a registered resource, which stays valid — the columns record a
-- reference that exists, they do not require one. Deliberately NOT foreign keys, for the same reason
-- the PO lineage (0291) is not: Site references resources across module boundaries by id, not by
-- join, and a resource may be retired without orphaning the historical usage that cites it.
-- ============================================================

ALTER TABLE public.aura_site_plant_usage
  ADD COLUMN IF NOT EXISTS resource_type text,
  ADD COLUMN IF NOT EXISTS resource_id uuid;

ALTER TABLE public.aura_site_plant_usage
  DROP CONSTRAINT IF EXISTS aura_site_plant_usage_resource_ref_ck;
ALTER TABLE public.aura_site_plant_usage
  ADD CONSTRAINT aura_site_plant_usage_resource_ref_ck CHECK (
    (resource_type IS NULL AND resource_id IS NULL)
    OR (resource_type IN ('asset', 'vehicle') AND resource_id IS NOT NULL)
  );

-- The read reconciliation makes: every day this exact resource was used, across the tenant.
CREATE INDEX IF NOT EXISTS idx_aura_site_plant_usage_resource
  ON public.aura_site_plant_usage (tenant_id, resource_type, resource_id)
  WHERE resource_id IS NOT NULL;

ALTER TABLE public.aura_site_labour_allocations
  ADD COLUMN IF NOT EXISTS subcontractor_id uuid;

CREATE INDEX IF NOT EXISTS idx_aura_site_labour_allocations_subcontractor
  ON public.aura_site_labour_allocations (tenant_id, subcontractor_id)
  WHERE subcontractor_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_site_labour_allocations_subcontractor;
ALTER TABLE public.aura_site_labour_allocations
  DROP COLUMN IF EXISTS subcontractor_id;
DROP INDEX IF EXISTS public.idx_aura_site_plant_usage_resource;
ALTER TABLE public.aura_site_plant_usage
  DROP CONSTRAINT IF EXISTS aura_site_plant_usage_resource_ref_ck;
ALTER TABLE public.aura_site_plant_usage
  DROP COLUMN IF EXISTS resource_type,
  DROP COLUMN IF EXISTS resource_id;

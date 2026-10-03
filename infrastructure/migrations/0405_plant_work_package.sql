-- ============================================================
-- AURA OS — migration 0405: the work package plant was working on (COST-CODE-01).
-- ------------------------------------------------------------
-- A plant record has always carried a PROJECT and a COST LINE: a scissor lift, ten hours, at 120 an
-- hour, charged to this line. Labour gained the work package its hours went into in 0323, and plant
-- did not — so the planning view could attribute a package's labour and never its plant, and every
-- plant hour read as cost no activity could claim.
--
-- NULLABLE, for the same reason as 0323: much plant genuinely serves no single package — a crane on
-- standby, a generator for the whole site. Null is reported as unattributed, never guessed.
--
-- No foreign key to Projects' WBS table (ADR-0004, as `cbs_node_id` on this table and `wbs_node_id`
-- on labour): Site does not read Projects' tables. The id is checked at the service boundary through
-- the project resolver Projects registers at boot, and a package of another project is refused at
-- the point of writing.
-- ============================================================

ALTER TABLE public.aura_site_plant_usage
  ADD COLUMN IF NOT EXISTS wbs_node_id uuid;

CREATE INDEX IF NOT EXISTS idx_site_plant_wbs_node
  ON public.aura_site_plant_usage (tenant_id, project_id, wbs_node_id)
  WHERE wbs_node_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_site_plant_wbs_node;
ALTER TABLE public.aura_site_plant_usage
  DROP COLUMN IF EXISTS wbs_node_id;

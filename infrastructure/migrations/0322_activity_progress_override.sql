-- ============================================================
-- AURA OS — migration 0322: where an activity's progress comes from.
-- ------------------------------------------------------------
-- `percent_complete` has been a number somebody typed. Nothing linked it to what was actually
-- installed, so a plan could report 80% while the Quantity Ledger — fed by approved site
-- installation — knew a different figure, and neither number could tell you which it was.
--
-- The chain that already exists, and ends one hop short:
--
--     installed quantity  →  Quantity Ledger  →  WBS node progress  →  (nothing)
--
-- This migration completes it by making the activity READ its work package rather than hold a
-- second opinion about it. Where the package is quantity-controlled, the activity's progress is
-- DERIVED on every read and is not stored at all: a stored copy is a copy as of the last time
-- somebody remembered to refresh it, which is the same mistake as a stored feasibility verdict.
--
-- WHAT IS STORED HERE IS THE OVERRIDE, and only that:
--
--     evidence    the work package's progress, derived from approved quantity   -> NOT stored
--     override    somebody stating a different figure, and why                  -> stored, here
--     declared    a plain number where no evidence exists at all                -> `percent_complete`
--
-- An override may only exist where there IS evidence to override. Without evidence a number is
-- not an override of anything; it is a declaration, which is what `percent_complete` has always
-- been and remains — now labelled as such rather than passing for fact.
--
-- The reason is required for the same cause a released booking and a declined allocation require
-- one: the next person to read "45% against the ledger's 20%" needs to know whether that was a
-- judgement or a mistake, and a planner who cannot record the judgement will simply overwrite the
-- evidence instead, which is the one outcome that helps nobody.
-- ============================================================

ALTER TABLE public.aura_projects_schedule_tasks
  ADD COLUMN IF NOT EXISTS progress_override        numeric,
  ADD COLUMN IF NOT EXISTS progress_override_reason text,
  ADD COLUMN IF NOT EXISTS progress_override_at     timestamptz,
  ADD COLUMN IF NOT EXISTS progress_override_by     text;

ALTER TABLE public.aura_projects_schedule_tasks
  DROP CONSTRAINT IF EXISTS aura_projects_schedule_tasks_override_range_check;
ALTER TABLE public.aura_projects_schedule_tasks
  ADD CONSTRAINT aura_projects_schedule_tasks_override_range_check
    CHECK (progress_override IS NULL OR (progress_override >= 0 AND progress_override <= 100));

-- An override says what was decided and when, or it is not an override.
ALTER TABLE public.aura_projects_schedule_tasks
  DROP CONSTRAINT IF EXISTS aura_projects_schedule_tasks_override_reason_check;
ALTER TABLE public.aura_projects_schedule_tasks
  ADD CONSTRAINT aura_projects_schedule_tasks_override_reason_check
    CHECK (progress_override IS NULL OR (btrim(coalesce(progress_override_reason, '')) <> '' AND progress_override_at IS NOT NULL));

-- The planner's open question: which activities are claiming something other than the evidence?
CREATE INDEX IF NOT EXISTS idx_aura_projects_schedule_tasks_override
  ON public.aura_projects_schedule_tasks (tenant_id, project_id)
  WHERE progress_override IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_projects_schedule_tasks_override;
ALTER TABLE public.aura_projects_schedule_tasks
  DROP CONSTRAINT IF EXISTS aura_projects_schedule_tasks_override_reason_check;
ALTER TABLE public.aura_projects_schedule_tasks
  DROP CONSTRAINT IF EXISTS aura_projects_schedule_tasks_override_range_check;
ALTER TABLE public.aura_projects_schedule_tasks
  DROP COLUMN IF EXISTS progress_override_by,
  DROP COLUMN IF EXISTS progress_override_at,
  DROP COLUMN IF EXISTS progress_override_reason,
  DROP COLUMN IF EXISTS progress_override;

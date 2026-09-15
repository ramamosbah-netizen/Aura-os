-- ============================================================
-- AURA OS — migration 0323: the work package a day's labour was spent on.
-- ------------------------------------------------------------
-- A labour allocation has always recorded a PROJECT and a TRADE: four electricians, eight hours,
-- on this job, on this day. That is enough to cost the hours and enough to fill the site diary's
-- manpower section, and it is not enough to answer the question the delivery plan actually asks —
-- how many hours went into THIS work package.
--
-- Without that link, achieved productivity cannot be derived at all. PLN-11 froze the rate every
-- awarded line was PRICED at (migration none — it rides in the handover envelope), and the plan can
-- now say a crew is installing 6 m² a day against 16 priced. It cannot say whether those 6 took the
-- priced hours or three times them, because the hours are recorded against the whole project and
-- the metres against one package. This column is the missing half.
--
-- NULLABLE, and null is the norm rather than a defect. Most labour is recorded by a foreman filling
-- in a day sheet, and a great deal of a day's work genuinely does not belong to one package —
-- mobilisation, housekeeping, standing time, a crew moving between three risers. Forcing a package
-- onto every row would manufacture attribution that nobody observed, and a productivity figure
-- built on manufactured attribution is worse than none: it is confidently wrong.
--
-- WHICH IS WHY EVERY READER MUST CARRY THE UNATTRIBUTED REMAINDER. A project with 500 man-hours of
-- which 40 name a package will compute a flattering factor for that package if the other 460 are
-- ignored. The rule that reads this column reports how much of the project's labour names no
-- package at all, so the figure can never be read as complete when it is not. See
-- modules/projects/src/domain/labour-productivity.ts.
--
-- No foreign key to Projects' WBS table (ADR-0004, exactly as `cbs_node_id` on this same table and
-- every other cross-context reference here): Site does not read Projects' tables. The id is checked
-- at the service boundary through the project resolver Projects registers at boot, so a package
-- from another project — or one that does not exist — is refused at the point of writing rather
-- than discovered later by a report that quietly drops the row.
-- ============================================================

ALTER TABLE public.aura_site_labour_allocations
  ADD COLUMN IF NOT EXISTS wbs_node_id uuid;

-- The read behind "how many hours went into this package": one scan per project, grouped by node.
CREATE INDEX IF NOT EXISTS idx_site_labour_wbs_node
  ON public.aura_site_labour_allocations (tenant_id, project_id, wbs_node_id)
  WHERE wbs_node_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_site_labour_wbs_node;
ALTER TABLE public.aura_site_labour_allocations
  DROP COLUMN IF EXISTS wbs_node_id;

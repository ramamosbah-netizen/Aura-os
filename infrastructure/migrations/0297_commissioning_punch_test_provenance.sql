-- ============================================================
-- AURA OS — migration 0297: punch-item provenance to the test evidence (TC-GATE-2)
-- ------------------------------------------------------------
-- A commissioning punch item is a defect that blocks sign-off. Until now it carried no link to the
-- thing that found it, so the chain the delivery architecture depends on —
--
--     Run #1 FAILED  →  defect  →  corrective action  →  Run #2 PASSED
--
-- had a hole in the middle: a reader could see a failed run and an open defect on the same system
-- and had no way to know whether they were the same problem or two. "Retest linked to the prior
-- failure where possible" is not possible without somewhere to put the link.
--
-- Two nullable columns, both pointing INTO T&C's own evidence. This adds no authority: the punch
-- list is already commissioning-owned, and the test point and run are the tables migration 0296
-- created. Nullable because a defect may legitimately be raised by eye on a walk-around rather than
-- by a failing test, and that is not a lesser defect — it simply has no test to point at.
--
-- What this deliberately does NOT add: any reference to a Quality NCR or snag. Quality owns that
-- authority, escalation into it needs a Quality-side writer, and a column nothing can populate is
-- worse than an honest gap. Recorded as a Gate-3 dependency instead.
-- ============================================================

ALTER TABLE public.aura_commissioning_punch_items
  ADD COLUMN IF NOT EXISTS test_item_id  uuid,
  ADD COLUMN IF NOT EXISTS source_run_id uuid;

COMMENT ON COLUMN public.aura_commissioning_punch_items.test_item_id IS
  'The test point whose failure raised this defect. Null for a defect found outside testing.';
COMMENT ON COLUMN public.aura_commissioning_punch_items.source_run_id IS
  'The specific failing run (aura_commissioning_test_runs.id) this defect answers.';

-- Finding a system's defects by the point they came from, which is how the Defects & Retests
-- surface groups them.
CREATE INDEX IF NOT EXISTS idx_cx_punch_items_test_item
  ON public.aura_commissioning_punch_items (tenant_id, test_item_id)
  WHERE test_item_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_cx_punch_items_test_item;
ALTER TABLE public.aura_commissioning_punch_items
  DROP COLUMN IF EXISTS source_run_id,
  DROP COLUMN IF EXISTS test_item_id;

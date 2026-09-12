-- ============================================================
-- AURA OS — migration 0296: Commissioning test-run lineage (TC-GATE-1)
-- ------------------------------------------------------------
-- THE DEFECT THIS CLOSES.
--
-- A test point (aura_commissioning_test_items) carried ONE result, updated in place. A point that
-- failed and was later retested became `result = 'pass'` on the same row, with tested_at overwritten
-- and the failing remark replaced by the passing one. The failure was therefore visible only until
-- it was corrected — exactly backwards for a record whose purpose is to prove what happened. There
-- was no way to answer "was this ever failed, and what fixed it?", which is the question a
-- consultant, a client and a dispute all ask.
--
-- THE MODEL.
--
-- A test point becomes a DEFINITION (point no, description, expected). Every execution of it is an
-- immutable RUN in this table. The authoritative result of a point is its LATEST run; the columns on
-- the test item are kept as a derived snapshot of that run, so existing readers keep working, but
-- they are now a projection rather than the truth.
--
--   Run #1 FAILED  →  correction / retest  →  Run #2 PASSED
--   both rows remain, forever, and the point reads PASS.
--
-- IMMUTABILITY IS ENFORCED HERE, NOT ONLY IN THE SERVICE.
--
-- The policies below grant SELECT and INSERT and nothing else. With RLS enabled and no policy for
-- UPDATE or DELETE, no row is VISIBLE to either command: the statement matches nothing and reports
-- zero rows affected. It does not raise — worth knowing, because code that "successfully" updates a
-- run has updated nothing and only a rowCount check would notice — but the guarantee is the same
-- one either way: no application path, present or future, can rewrite or erase a recorded run. A
-- guard that lives only in a service is one refactor from being bypassed; this one is not.
-- (The migration/owner role is a superuser and bypasses RLS entirely, which is what lets the
-- backfill below run and what lets an operator repair data deliberately; the application role is
-- NOBYPASSRLS and is bound. Both halves are asserted in test-run-immutability.rls.pg-int.test.ts.)
--
-- The unique (test_item_id, run_no) constraint makes a concurrent double-append fail loudly rather
-- than quietly produce two "run 2"s for one point.
--
-- BACKFILL. Every test point that already carries a result becomes its run #1, so history does not
-- start empty for work already done and the 360 does not report "never tested" for a tested point.
-- Points still `pending` have never been executed and correctly get no run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_commissioning_test_runs (
  id               uuid        PRIMARY KEY,
  tenant_id        text        NOT NULL,
  company_id       text,
  test_item_id     uuid        NOT NULL,
  -- Denormalised so a record's whole lineage is one indexed read, and so the record is reachable
  -- from a run without joining through the item.
  commissioning_id uuid        NOT NULL,
  project_id       text        NOT NULL,
  run_no           integer     NOT NULL,
  result           text        NOT NULL,            -- pass | fail
  actual           text,                            -- the measured value for THIS run
  remarks          text,
  tested_by        text,
  tested_at        timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_commissioning_test_runs_result_chk CHECK (result IN ('pass', 'fail')),
  CONSTRAINT aura_commissioning_test_runs_run_no_chk CHECK (run_no >= 1),
  CONSTRAINT aura_commissioning_test_runs_item_run_uq UNIQUE (test_item_id, run_no)
);

CREATE INDEX IF NOT EXISTS idx_cx_test_runs_item
  ON public.aura_commissioning_test_runs (tenant_id, test_item_id, run_no);
CREATE INDEX IF NOT EXISTS idx_cx_test_runs_record
  ON public.aura_commissioning_test_runs (tenant_id, commissioning_id);

ALTER TABLE public.aura_commissioning_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_commissioning_test_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.aura_commissioning_test_runs;
DROP POLICY IF EXISTS tenant_isolation_select ON public.aura_commissioning_test_runs;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.aura_commissioning_test_runs;

-- Read: same tenant, fail-closed when no tenant is bound (matches the sibling commissioning tables).
CREATE POLICY tenant_isolation_select ON public.aura_commissioning_test_runs
  FOR SELECT
  USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

-- Append: same tenant AND the run must belong to a test point of that same tenant, so a run cannot
-- be attached to another tenant's point by supplying its id.
CREATE POLICY tenant_isolation_insert ON public.aura_commissioning_test_runs
  FOR INSERT
  WITH CHECK (
    tenant_id::text = public.current_tenant_id()
    AND public.current_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.aura_commissioning_test_items i
      WHERE i.id = test_item_id AND i.tenant_id = tenant_id
    )
  );

-- NO UPDATE OR DELETE POLICY, ON PURPOSE. See the header: this is what makes the lineage immutable.

-- ── Backfill: an already-recorded result becomes run #1 of its point ─────────────────────────────
INSERT INTO public.aura_commissioning_test_runs
  (id, tenant_id, company_id, test_item_id, commissioning_id, project_id, run_no, result, actual, remarks, tested_by, tested_at, created_at)
SELECT
  gen_random_uuid(), i.tenant_id, i.company_id, i.id, i.commissioning_id, i.project_id, 1,
  i.result, i.actual, i.remarks, i.tested_by,
  COALESCE(i.tested_at, i.created_at), COALESCE(i.tested_at, i.created_at)
FROM public.aura_commissioning_test_items i
WHERE i.result IN ('pass', 'fail')
  AND NOT EXISTS (SELECT 1 FROM public.aura_commissioning_test_runs r WHERE r.test_item_id = i.id);

-- @DOWN
DROP TABLE IF EXISTS public.aura_commissioning_test_runs;

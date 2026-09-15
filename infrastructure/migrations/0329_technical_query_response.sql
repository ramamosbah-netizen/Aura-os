-- ============================================================
-- AURA OS — migration 0329: a technical query RESPONSE is a design decision, not a text field.
-- ------------------------------------------------------------
-- A TQ is raised by the contractor to the consultant seeking a design clarification, and site then
-- BUILDS TO THE ANSWER. That makes the response the most consequential piece of text on the record,
-- and it was held with none of the protection that implies:
--
--   · nobody was recorded as having given it. `responded_at` existed; `responded_by` did not, so a
--     TQ you are about to build to could not say who decided it. The actor was in the event log and
--     nowhere a reader would look.
--
--   · replacing one overwrote it silently. `respondToQuery` simply assigned the new text. A design
--     answer given in March and changed in June left no trace of March — and March is what was
--     built. This is the same defect migration 0327 closed for the baseline, in a place where the
--     consequence is poured concrete rather than a variance figure.
--
--   · the loop never closed. `closed` was in the status union and NOTHING in the codebase could
--     reach it, so every TQ ever raised sat at `responded` for ever and nothing recorded whether the
--     answer was adequate.
--
-- So: answers become REVISIONS. Replacing one adds a row rather than destroying one, and the
-- superseded text stays readable with the reason it was replaced. `responded_by`, `closed_at` and
-- `closed_by` join the record itself, and `drawing_id` links the query to the canonical drawing
-- register instead of the free-text `drawing_reference` that could never be traced to a revision.
--
-- CLOSING IS THE RAISER'S ACT, enforced in the domain: the person who answered cannot also declare
-- their own answer adequate. A permission separates them too, but the rule holds even where one
-- person happens to hold both.
-- ============================================================

ALTER TABLE public.aura_engineering_technical_queries
  -- WHO gave the design decision. Null for queries answered before this migration: unknown, which
  -- is the honest value — not a guess at whoever happened to be the last actor.
  ADD COLUMN IF NOT EXISTS responded_by      text,
  -- 0 is the original answer. Every replacement increments it, so how many times a decision moved
  -- is visible without reading the history.
  ADD COLUMN IF NOT EXISTS response_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by         text,
  -- The canonical drawing this query is about. `drawing_reference` stays for the free text that
  -- cannot be resolved; new queries carry the id, and a query about a drawing from another project
  -- is refused by the service before it reaches here.
  ADD COLUMN IF NOT EXISTS drawing_id        uuid;

-- A closing is a whole fact or none of it: a date with nobody behind it records nothing.
ALTER TABLE public.aura_engineering_technical_queries
  DROP CONSTRAINT IF EXISTS aura_engineering_tq_closed_complete;
ALTER TABLE public.aura_engineering_technical_queries
  ADD CONSTRAINT aura_engineering_tq_closed_complete CHECK (
    (closed_at IS NULL AND closed_by IS NULL) OR (closed_at IS NOT NULL AND closed_by IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_engineering_tq_drawing
  ON public.aura_engineering_technical_queries (tenant_id, drawing_id) WHERE drawing_id IS NOT NULL;

-- ------------------------------------------------------------
-- The answers that have stood on this query, oldest first.
--
-- APPEND-ONLY by design and by grant (SELECT and INSERT, nothing else): a superseded design decision
-- is a thing that happened, and a record that could be edited afterwards is not a record of it. The
-- text is kept BY VALUE rather than referencing the query's current response, which would defeat the
-- entire purpose the moment the next answer arrived.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aura_engineering_tq_responses (
  id                 uuid PRIMARY KEY,
  tenant_id          text NOT NULL,
  project_id         text NOT NULL,
  technical_query_id uuid NOT NULL
    REFERENCES public.aura_engineering_technical_queries (id) ON DELETE CASCADE,
  revision           integer NOT NULL,
  response           text NOT NULL,
  responded_at       timestamptz NOT NULL,
  responded_by       text,
  -- Why this answer was replaced. Required on every row here: a revision only exists because
  -- something displaced it, and the first answer is written to this table at the moment it is
  -- superseded, carrying the reason given then.
  superseded_reason  text NOT NULL,
  superseded_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_engineering_tq_responses_unique UNIQUE (technical_query_id, revision),
  CONSTRAINT aura_engineering_tq_responses_reason CHECK (length(btrim(superseded_reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_engineering_tq_responses_query
  ON public.aura_engineering_tq_responses (tenant_id, technical_query_id, revision);

-- ENABLE and FORCE, because FORCE is what binds a non-superuser owner; without it an
-- owner-connected proof passes vacuously.
ALTER TABLE public.aura_engineering_tq_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_engineering_tq_responses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_engineering_tq_responses;
CREATE POLICY tenant_isolation_policy ON public.aura_engineering_tq_responses
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT ON public.aura_engineering_tq_responses TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_engineering_tq_responses;
ALTER TABLE public.aura_engineering_technical_queries
  DROP CONSTRAINT IF EXISTS aura_engineering_tq_closed_complete;
ALTER TABLE public.aura_engineering_technical_queries
  DROP COLUMN IF EXISTS drawing_id,
  DROP COLUMN IF EXISTS closed_by,
  DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS response_revision,
  DROP COLUMN IF EXISTS responded_by;

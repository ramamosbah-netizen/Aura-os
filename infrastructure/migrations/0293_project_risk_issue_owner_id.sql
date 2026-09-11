-- ============================================================
-- AURA OS — migration 0293: AURA-PM-001 — project risks and issues carry an owner id
-- ------------------------------------------------------------
-- A project risk's / issue's accountable owner was free text only (owner_name), the shape borrowed
-- from the CRM risk register. That is fine for a register read one project at a time, and it stops
-- being fine the moment My Work has to answer "risks assigned to me": every other My Work source
-- carries a real user id for assignment, so risks and issues could answer only "raised by me" — half
-- the feature. Matching a typed name against an actor id would be a guess dressed as a fact.
--
-- owner_id is the accountable USER, beside owner_name, both nullable and independent: a record may
-- carry a name with no user (a subcontractor's engineer, a client rep — kept deliberately), an
-- assigned user, both, or neither. Only owner_id is ever matched to an actor.
--
-- Not a foreign key to aura_users, consistent with created_by / raised_by on these same tables (id
-- columns, not joins) — the user master is platform-owned and a row must survive a user being
-- deprovisioned without the historical register losing who owned it.
-- ============================================================

ALTER TABLE public.aura_projects_risks
  ADD COLUMN IF NOT EXISTS owner_id uuid;

ALTER TABLE public.aura_projects_issues
  ADD COLUMN IF NOT EXISTS owner_id uuid;

-- The read My Work makes: every open risk / issue assigned to this user, tenant-scoped.
CREATE INDEX IF NOT EXISTS idx_aura_projects_risks_owner
  ON public.aura_projects_risks (tenant_id, owner_id)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aura_projects_issues_owner
  ON public.aura_projects_issues (tenant_id, owner_id)
  WHERE owner_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_projects_issues_owner;
DROP INDEX IF EXISTS public.idx_aura_projects_risks_owner;
ALTER TABLE public.aura_projects_issues
  DROP COLUMN IF EXISTS owner_id;
ALTER TABLE public.aura_projects_risks
  DROP COLUMN IF EXISTS owner_id;

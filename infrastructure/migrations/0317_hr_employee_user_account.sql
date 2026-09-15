-- AURA OS — migration 0317: the governed link between an EMPLOYMENT record and a LOGIN.
-- ------------------------------------------------------------
-- Planning can commit a named employee to an activity, but nothing could turn that
-- commitment into the person's own work: `aura_hr_employees` knows a person, `aura_users`
-- knows an account, and no row connected them. Matching on name or email was the obvious
-- shortcut and the wrong one — two "Mohammed Ali"s, a shared site mailbox, or a personal
-- address reused at a second employer each produce a CONFIDENT WRONG assignment, which is
-- worse than none at all. The link is therefore explicit, administered and auditable.
--
-- It lives on the employee row rather than in a join table because it is single-valued on
-- both sides and has no life of its own: one employment record, at most one login.
--
-- ONE ACCOUNT, ONE EMPLOYEE (the partial unique index). Two employment records sharing a
-- login would make "whose allocation is this?" unanswerable, and every downstream read —
-- My Work, timesheets, acceptance — would have to guess. The constraint is partial so the
-- many unlinked employees (site labour with no system account) stay unconstrained.
--
-- No foreign key to `aura_users`: that registry is deliberately outside tenant RLS
-- (migration 0163) and an identity may be authenticated by a hosted IdP with no row here
-- at all. Existence is checked at the service boundary, where the tenant is bound.
-- ============================================================

ALTER TABLE public.aura_hr_employees
  ADD COLUMN IF NOT EXISTS user_id        text,
  ADD COLUMN IF NOT EXISTS user_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_linked_by text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_aura_hr_employees_user_account
  ON public.aura_hr_employees (tenant_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- The lookup on the My Work read path: account -> employee, once per request.
CREATE INDEX IF NOT EXISTS idx_aura_hr_employees_user_account
  ON public.aura_hr_employees (tenant_id, user_id)
  WHERE user_id IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_hr_employees_user_account;
DROP INDEX IF EXISTS public.uq_aura_hr_employees_user_account;
ALTER TABLE public.aura_hr_employees
  DROP COLUMN IF EXISTS user_linked_by,
  DROP COLUMN IF EXISTS user_linked_at,
  DROP COLUMN IF EXISTS user_id;

-- ============================================================
-- AURA OS — migration 0320: who holds this asset.
-- ------------------------------------------------------------
-- Fleet has always known who drives a vehicle (`driver_employee_id`, migration 0026). Assets knew
-- what a thing is, what it cost and when it is next calibrated — and never who has it. So a tester
-- committed to a site on Tuesday reached nobody, because there was nobody to reach.
--
-- The field lives HERE, in the register that owns the asset, not in Projects. §22 references
-- resources and does not own them (DG-22.2): a custody column in the planning module would be a
-- second answer to a question the asset register is the authority on, and the two would drift the
-- first time somebody handed the tester over without opening a plan.
--
-- SHAPED LIKE FLEET'S, deliberately. Fleet records a single nullable employee id and nothing else;
-- matching that is worth more than a richer model invented here, because the two registers answer
-- the same question and every reader of one will read the other. Custody HISTORY is not kept: it
-- changes often, `updated_at` moves with it, and the audit log carries the sequence. What this
-- column answers is only ever "who has it now" — which is the question a forward-looking work list
-- asks, and the only one it can answer honestly.
--
-- NULL is normal and permanent for plenty of assets: a rack in a store room is held by nobody.
-- Nothing may read a null custodian as "unassigned, therefore anybody's".
--
-- No foreign key to HR (ADR-0004, and the same reasoning as every other cross-module reference
-- here): the id is checked against HR's catalogue at the service boundary.
-- ============================================================

ALTER TABLE public.aura_assets
  ADD COLUMN IF NOT EXISTS custodian_employee_id uuid;

-- The read behind "which equipment commitments concern me?" — one lookup per work-list request.
CREATE INDEX IF NOT EXISTS idx_aura_assets_custodian
  ON public.aura_assets (tenant_id, custodian_employee_id)
  WHERE custodian_employee_id IS NOT NULL AND deleted_at IS NULL;

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_assets_custodian;
ALTER TABLE public.aura_assets
  DROP COLUMN IF EXISTS custodian_employee_id;

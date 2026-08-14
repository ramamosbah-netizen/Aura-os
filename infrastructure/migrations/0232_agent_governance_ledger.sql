-- Governed Agent Execution Ledger + idempotent metering (Phase 7-01).
--
-- The runtime already wrote a row to aura_agent_executions, but it recorded almost nothing you
-- could audit a decision from: no record of what was proposed vs what actually ran, whether a human
-- gate fired, or how many credits it cost. And nothing tied the row to a billing charge, so a retry
-- of the same execution could debit a tenant twice. This widens the ledger into a real black-box
-- recorder — request -> decision -> execution -> outcome — and gives both the execution row and the
-- credit-ledger row a stable billing_key so a replay is metered exactly once.
--
-- All columns are nullable-or-defaulted and backfilled, so existing rows keep the behaviour they had.

-- ── Enrich the execution ledger ─────────────────────────────────────────────
ALTER TABLE public.aura_agent_executions
  ADD COLUMN IF NOT EXISTS trigger_type      text           not null default 'manual',
  ADD COLUMN IF NOT EXISTS input_context     jsonb          not null default '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tools_called      jsonb          not null default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS actions_proposed  jsonb          not null default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS actions_executed  jsonb          not null default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_required boolean        not null default false,
  ADD COLUMN IF NOT EXISTS approval_status   text,          -- null | 'not_required' | 'pending' | 'approved' | 'rejected'
  ADD COLUMN IF NOT EXISTS credits_consumed  numeric(12, 4) not null default 0,
  ADD COLUMN IF NOT EXISTS denied_gate       text,          -- which governance gate rejected the run, if any
  ADD COLUMN IF NOT EXISTS model_version     text,
  ADD COLUMN IF NOT EXISTS error             text,
  ADD COLUMN IF NOT EXISTS billing_key       text,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz    not null default now();

-- A completed run that predates this migration had its actions applied and was not gated.
UPDATE public.aura_agent_executions
   SET approval_status = 'not_required'
 WHERE approval_status IS NULL
   AND status IN ('completed', 'proposal_generated');

-- One billing_key ⇒ one charge. Partial so the many legacy NULL rows don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_executions_billing_key
  ON public.aura_agent_executions (billing_key)
  WHERE billing_key IS NOT NULL;

-- The AI workspace lists a tenant's runs newest-first; index that scan.
CREATE INDEX IF NOT EXISTS idx_agent_executions_tenant_created
  ON public.aura_agent_executions (tenant_id, created_at DESC);

-- ── Tie the credit ledger to the execution that spent it ────────────────────
ALTER TABLE public.aura_ai_credit_ledger
  ADD COLUMN IF NOT EXISTS billing_key text;

-- The debit is idempotent on this key: a second consume for the same key is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_credit_ledger_billing_key
  ON public.aura_ai_credit_ledger (billing_key)
  WHERE billing_key IS NOT NULL;

-- @DOWN
DROP INDEX IF EXISTS uq_ai_credit_ledger_billing_key;
ALTER TABLE public.aura_ai_credit_ledger DROP COLUMN IF EXISTS billing_key;

DROP INDEX IF EXISTS idx_agent_executions_tenant_created;
DROP INDEX IF EXISTS uq_agent_executions_billing_key;
ALTER TABLE public.aura_agent_executions
  DROP COLUMN IF EXISTS trigger_type,
  DROP COLUMN IF EXISTS input_context,
  DROP COLUMN IF EXISTS tools_called,
  DROP COLUMN IF EXISTS actions_proposed,
  DROP COLUMN IF EXISTS actions_executed,
  DROP COLUMN IF EXISTS approval_required,
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS credits_consumed,
  DROP COLUMN IF EXISTS denied_gate,
  DROP COLUMN IF EXISTS model_version,
  DROP COLUMN IF EXISTS error,
  DROP COLUMN IF EXISTS billing_key,
  DROP COLUMN IF EXISTS updated_at;

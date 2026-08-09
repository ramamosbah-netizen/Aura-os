-- ============================================================
-- AURA OS — migration 0221: Database-backed idempotency records
-- ------------------------------------------------------------
-- Guarantees atomic, exactly-once execution for API mutations across
-- multi-instance scaling and intermittent field reconnects.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_idempotency_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  operation_id    text NOT NULL,
  user_id         text NOT NULL DEFAULT '',
  endpoint        text NOT NULL,
  method          text NOT NULL DEFAULT 'POST',
  request_hash    text NOT NULL,
  status          text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  resource_type   text NOT NULL DEFAULT '',
  resource_id     text,
  response_status integer NOT NULL DEFAULT 200,
  response_body   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  CONSTRAINT unq_idempotency_tenant_op UNIQUE (tenant_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_tenant_op ON public.aura_idempotency_records(tenant_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_status ON public.aura_idempotency_records(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON public.aura_idempotency_records(expires_at);

-- Tenant isolation policy. ENABLE applies it to every non-owner role; FORCE extends it to the
-- owner as well, which is what 0163 requires of every tenant-scoped table and what
-- scripts/rls-fitness.mjs asserts in CI.
ALTER TABLE public.aura_idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_idempotency_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_idempotency_records;
CREATE POLICY tenant_isolation_policy ON public.aura_idempotency_records
  FOR ALL USING (tenant_id = public.current_tenant_id());

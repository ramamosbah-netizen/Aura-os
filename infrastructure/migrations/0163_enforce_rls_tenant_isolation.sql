-- ============================================================
-- AURA OS kernel — migration 0163: enforce RLS tenant isolation (Roadmap R1 / G-P0-1)
-- ------------------------------------------------------------
-- Live-tree re-audit (2026-07-14) found tenant isolation was NOT enforced:
--   * the runtime connects as a BYPASSRLS role, so policies were inert;
--   * 0 of 154 tenant-scoped tables had FORCE ROW LEVEL SECURITY;
--   * 22 tenant-scoped tables had RLS disabled and 27 had no policy.
-- This migration makes isolation ENFORCEABLE and additive:
--   1. a least-privilege application role `aura_app` (NOSUPERUSER, NOBYPASSRLS, NOLOGIN
--      until the operator grants LOGIN) — the runtime must connect AS this role for RLS
--      to take effect (a BYPASSRLS/superuser role always bypasses RLS);
--   2. ENABLE + FORCE ROW LEVEL SECURITY on every tenant-scoped `aura_*` business table,
--      so isolation applies even to a table's owner;
--   3. a canonical fail-closed `tenant_isolation_policy` on any such table still missing one
--      (existing per-table policies + the projects hierarchical policies are left intact).
-- It changes nothing for the current BYPASSRLS runtime; isolation activates when the app
-- connects as `aura_app`. See docs/runbooks/rls-tenant-isolation.md.
--
-- Explicitly EXCLUDED (system / pre-tenant paths — see runbook §Exclusions):
--   aura_events               — event store; the outbox relay polls cross-tenant via the
--                               owner/system connection (a controlled path), not aura_app.
--   aura_users                — authentication lookup happens BEFORE a tenant context exists.
--   aura_service_accounts     — machine authentication; pre-tenant.
--   aura_webhook_subscriptions— system integration config; delivered by a system worker.
--   aura_vector_store         — AI embedding infrastructure accessed via guardrailed service.
-- (Tables without a tenant_id column are out of scope by definition.)
-- ============================================================

-- 1. Least-privilege application role. NOLOGIN so committing this migration ships no
--    credential; the operator grants LOGIN + a password (or grants aura_app to their
--    existing restricted app role) as the activation step.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aura_app') THEN
    CREATE ROLE aura_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOLOGIN;
  ELSE
    ALTER ROLE aura_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO aura_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aura_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aura_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aura_app;
-- future tables/sequences/functions created by the migration owner also grant to aura_app
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aura_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO aura_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO aura_app;

-- 2 + 3. Enable + FORCE RLS on every tenant-scoped business table, and add the canonical
-- fail-closed policy where none exists. Dynamic so it covers all current tables and is a
-- template for the fitness test; idempotent (safe to re-run).
DO $$
DECLARE
  r record;
  excluded text[] := array[
    'aura_events', 'aura_users', 'aura_service_accounts',
    'aura_webhook_subscriptions', 'aura_vector_store'
  ];
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'aura_%'
      AND c.relname <> ALL (excluded)
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'tenant_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);

    -- Only add the canonical policy when the table has NO policy at all. Tables that already
    -- carry `tenant_isolation_policy` (127) or the projects `hierarchical_isolation_policy`
    -- are left untouched — permissive policies OR together, so adding a second broader policy
    -- would WIDEN access. Existing `tenant_id = current_tenant_id()` policies are already
    -- fail-closed (the comparison is NULL — and thus denies — when the GUC is unset).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.relname
    ) THEN
      -- Cast the column to text so the policy works whether tenant_id is text or uuid.
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON public.%I '
        || 'FOR ALL '
        || 'USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL) '
        || 'WITH CHECK (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)',
        r.relname
      );
    END IF;
  END LOOP;
END $$;

-- @DOWN
-- Reverse only the enforcement toggles this migration introduced. Policies are left in place
-- (they are the intended steady state and are harmless under a BYPASSRLS role); the role is
-- dropped after its grants are revoked.
DO $$
DECLARE
  r record;
  excluded text[] := array[
    'aura_events', 'aura_users', 'aura_service_accounts',
    'aura_webhook_subscriptions', 'aura_vector_store'
  ];
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'aura_%'
      AND c.relname <> ALL (excluded)
      AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public' AND col.table_name = c.relname
                    AND col.column_name = 'tenant_id')
  LOOP
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aura_app') THEN
    -- reverse the default-privilege grants (else they hold a dependency on the role)
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM aura_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM aura_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM aura_app;
    -- DROP OWNED BY removes all remaining privileges granted to the role (requires an admin/
    -- superuser role — the migration owner); then the role can be dropped.
    DROP OWNED BY aura_app;
    DROP ROLE aura_app;
  END IF;
END $$;

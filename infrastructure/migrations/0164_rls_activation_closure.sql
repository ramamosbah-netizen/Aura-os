-- ============================================================
-- AURA OS kernel — migration 0164: RLS activation closure (Roadmap R1 / G-P0-1)
-- ------------------------------------------------------------
-- 0163 made every tenant-scoped `aura_*` table FORCE RLS + policy, and the runtime was hardened
-- to bind the tenant on every connection. Auditing the runtime under the real (non-BYPASSRLS)
-- `aura_app` role surfaced tables that 0163 did NOT resolve and that would break the app:
--
--   A. "RLS enabled, NO policy" system/pre-tenant tables. `ENABLE ROW LEVEL SECURITY` applies to
--      EVERY non-owner role — FORCE only extends it to the owner — so a table with RLS enabled
--      and zero policies is DENY-ALL for `aura_app`. These tables were enabled (by their creating
--      migrations) with no policy on the assumption the app connects as a BYPASSRLS service role.
--      Under `aura_app` that assumption is false, so:
--        * aura_events                — the outbox relay could read NO pending events → the whole
--                                       event/reactor engine halts, and every business write that
--                                       appends an event fails.
--        * aura_users, aura_service_accounts — login/machine-auth look up the principal BEFORE a
--                                       tenant context exists → deny-all locks everyone out.
--        * aura_webhook_subscriptions, aura_webhook_deliveries — the dispatcher + cross-tenant
--                                       retry worker could neither read subs nor record deliveries.
--      These are genuinely system / pre-tenant / cross-tenant-worker tables (the documented R1
--      exclusions). Their isolation is enforced in application code (queries filter by tenant_id;
--      the relay/worker are cross-tenant by design). The correct state for them under a single
--      app role is RLS DISABLED — that is what "excluded" was always meant to mean; 0163 only
--      skipped FORCE and left the pre-existing enable in place, which is the deny-all trap.
--
--   B. aura_document_versions — RLS enabled, but it has NO tenant_id column (it is isolated
--      through its parent aura_documents), so 0163 skipped it → deny-all. It is genuinely
--      tenant-owned, so it gets a PARENT-JOIN isolation policy (same pattern 0032 uses for
--      journal_lines/calendar children), NOT an exclusion.
--
--   C. aura_workflow_definitions — a definition row is either GLOBAL (tenant_id = '', the platform
--      template shared by all tenants — migration 0003) or tenant-specific. 0163's canonical
--      `tenant_id = current_tenant_id()` policy hides global rows from every tenant and blocks the
--      boot WorkflowSeeder. Replace it with a global-aware policy that keeps per-tenant isolation
--      but treats tenant_id = '' as shared config.
--
-- All changes are additive + idempotent. Trust boundaries are documented in
-- docs/runbooks/rls-tenant-isolation.md (§Exclusions, §Execution-path classification).
-- ============================================================

-- A. System / pre-tenant tables: DISABLE RLS so the enforced app role can reach them.
--    (Kept in lock-step with the EXCLUDED set in apps/api/scripts/rls-fitness.mjs.)
DO $$
DECLARE
  r text;
  system_tables text[] := array[
    'aura_events', 'aura_users', 'aura_service_accounts',
    'aura_webhook_subscriptions', 'aura_webhook_deliveries'
  ];
BEGIN
  FOREACH r IN ARRAY system_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=r) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r);
    END IF;
  END LOOP;
END $$;

-- B. aura_document_versions: isolate through its parent document (no tenant_id of its own).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='aura_document_versions') THEN
    ALTER TABLE public.aura_document_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.aura_document_versions FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_document_versions;
    CREATE POLICY tenant_isolation_policy ON public.aura_document_versions
      FOR ALL
      USING (EXISTS (SELECT 1 FROM public.aura_documents d
                     WHERE d.id = document_id
                       AND d.tenant_id = public.current_tenant_id()
                       AND public.current_tenant_id() IS NOT NULL))
      WITH CHECK (EXISTS (SELECT 1 FROM public.aura_documents d
                          WHERE d.id = document_id
                            AND d.tenant_id = public.current_tenant_id()
                            AND public.current_tenant_id() IS NOT NULL));
  END IF;
END $$;

-- C. aura_workflow_definitions: per-tenant rows isolated, global ('') templates shared.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='aura_workflow_definitions') THEN
    ALTER TABLE public.aura_workflow_definitions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.aura_workflow_definitions FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_workflow_definitions;
    DROP POLICY IF EXISTS workflow_definitions_isolation_policy ON public.aura_workflow_definitions;
    CREATE POLICY workflow_definitions_isolation_policy ON public.aura_workflow_definitions
      FOR ALL
      USING (tenant_id = public.current_tenant_id() OR tenant_id = '')
      WITH CHECK (tenant_id = public.current_tenant_id() OR tenant_id = '');
  END IF;
END $$;

-- @DOWN
-- Reverse each part back to the 0163 state.
-- A. Re-enable RLS on the system tables (their creating migrations had them enabled, no policy).
DO $$
DECLARE
  r text;
  system_tables text[] := array[
    'aura_events', 'aura_users', 'aura_service_accounts',
    'aura_webhook_subscriptions', 'aura_webhook_deliveries'
  ];
BEGIN
  FOREACH r IN ARRAY system_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=r) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r);
    END IF;
  END LOOP;
END $$;

-- B. Drop the parent-join policy on document_versions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='aura_document_versions') THEN
    DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_document_versions;
    ALTER TABLE public.aura_document_versions NO FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

-- C. Restore the canonical (non-global) workflow policy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='aura_workflow_definitions') THEN
    DROP POLICY IF EXISTS workflow_definitions_isolation_policy ON public.aura_workflow_definitions;
    DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_workflow_definitions;
    CREATE POLICY tenant_isolation_policy ON public.aura_workflow_definitions
      FOR ALL
      USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
      WITH CHECK (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);
  END IF;
END $$;

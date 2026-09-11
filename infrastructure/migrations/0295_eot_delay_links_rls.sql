-- ============================================================
-- AURA OS — migration 0295: AURA-RLS-001 residual — isolate the eot_delay_links link table
-- ------------------------------------------------------------
-- aura_projects_eot_delay_links (eot_claim_id, delay_event_id) is the one table AURA-RLS-001's live
-- read found without RLS: it has NO tenant_id column, so migration 0163's loop (which enables + forces
-- RLS on every aura_* table carrying tenant_id) never saw it, and neither does rls-fitness.mjs, which
-- discovers the same way. It is a link table between EOT claims and delay events — not itself
-- sensitive, but it joins two tables that are, so a reader who could see the links could learn which
-- delay events a tenant's EOT claims rest on.
--
-- A link table with no tenant_id isolates through a parent, exactly as aura_document_versions does
-- through aura_documents: the row is visible only when its EOT claim is visible to the current
-- tenant. The claim itself is hierarchically protected (tenant + project + company), so isolating
-- through it inherits that protection; a link whose claim the caller cannot see is a link about
-- nothing they may know. current_tenant_id() IS NOT NULL keeps it fail-closed when no tenant is
-- bound — the same guard the document-versions policy uses.
--
-- FORCE, not just ENABLE, so the policy binds the table owner too (defence-in-depth: on a deployment
-- whose owner is not a superuser, owner-role writes are governed as well). Note for the record: with
-- no tenant_id column this table stays invisible to rls-fitness.mjs's automated gate — the protection
-- is real, but the gate cannot confirm it, which is the exact blind spot AURA-RLS-001 named.
-- ============================================================

ALTER TABLE public.aura_projects_eot_delay_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_eot_delay_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_eot_delay_links;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_eot_delay_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.aura_projects_eot_claims e
      WHERE e.id = eot_claim_id
        AND e.tenant_id = public.current_tenant_id()
        AND public.current_tenant_id() IS NOT NULL
    )
  );

-- @DOWN
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_eot_delay_links;
ALTER TABLE public.aura_projects_eot_delay_links NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_eot_delay_links DISABLE ROW LEVEL SECURITY;

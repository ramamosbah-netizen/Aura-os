-- ============================================================
-- AURA OS — migration 0246: Pre-Award advisor hardening (post-Expand)
-- ------------------------------------------------------------
-- Closes the Supabase advisor findings that pertain to THIS program's new objects only:
--   - unindexed FKs: the compound estimate→basis FK, and pricing_sheets.estimate_revision_id
--   - function_search_path_mutable on the qualification-decision immutability trigger function
-- Pre-existing platform findings (aura_users / aura_service_accounts / aura_migrations / aura_events /
-- webhooks / access_* RLS, security-definer views, current_tenant_id search_path) are deliberately
-- NOT touched here — they predate this program and need their own decision.
-- ============================================================

create index if not exists idx_estimate_rev_basis_compound
  on public.aura_crm_estimate_revisions (package_id, basis_revision_id);
create index if not exists idx_pricing_sheets_estimate_rev
  on public.aura_crm_pricing_sheets (estimate_revision_id);

-- The body only RAISEs (no schema resolution), so an empty search_path is safe and closes the WARN.
alter function public.aura_crm_qual_decision_immutable() set search_path = '';

-- @DOWN
alter function public.aura_crm_qual_decision_immutable() reset search_path;
drop index if exists public.idx_pricing_sheets_estimate_rev;
drop index if exists public.idx_estimate_rev_basis_compound;

-- ============================================================
-- AURA OS — migration 0261: one primary contact per account
-- ------------------------------------------------------------
-- The service demotes siblings, while this partial unique index closes the
-- concurrency gap at the database boundary.
-- ============================================================

create unique index if not exists uq_crm_contacts_one_primary_per_account
  on public.aura_crm_contacts (tenant_id, account_id)
  where is_primary = true and account_id is not null;

-- @DOWN
drop index if exists public.uq_crm_contacts_one_primary_per_account;

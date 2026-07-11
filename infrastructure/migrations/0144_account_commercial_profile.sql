-- ============================================================
-- AURA OS — migration 0144: account commercial profile
-- ------------------------------------------------------------
-- The Account is the PERSISTENT commercial party at the head of the deal
-- chain (opportunities/tenders/quotations/contracts/projects are the
-- transactions that flow through it). Give it the profile fields the
-- Account-360 page shows: phone/email, billing address, source, payment terms.
-- ============================================================

alter table public.aura_crm_accounts
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists billing_address text,
  add column if not exists source text,
  add column if not exists payment_terms text;

-- @DOWN
alter table public.aura_crm_accounts
  drop column if exists payment_terms,
  drop column if exists source,
  drop column if exists billing_address,
  drop column if exists email,
  drop column if exists phone;

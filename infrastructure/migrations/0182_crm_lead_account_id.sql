-- CRM-7 — a Lead can carry the account it was resolved to (at promote / qualification), so a
-- name-only signal that matches an existing account links immediately instead of being re-matched
-- only later at Convert. Nullable: many leads stay unlinked until qualified.
ALTER TABLE public.aura_crm_leads ADD COLUMN IF NOT EXISTS account_id text;

-- @DOWN
alter table public.aura_crm_leads drop column if exists account_id;

-- ============================================================
-- AURA OS — migration 0145: opportunity pipeline fields
-- ------------------------------------------------------------
-- The deal chain becomes OPTIONAL per deal: `requires_tender` decides whether
-- winning the opportunity auto-creates a Tender (direct sales / AMC renewals /
-- variations / service contracts go straight to a quotation instead).
-- `owner_id` + `next_action` complete the pipeline card
-- (Account · Value · Probability · Close · Owner · Next action).
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists requires_tender boolean not null default true,
  add column if not exists owner_id text,
  add column if not exists next_action text;

-- @DOWN
alter table public.aura_crm_opportunities
  drop column if exists next_action,
  drop column if exists owner_id,
  drop column if exists requires_tender;

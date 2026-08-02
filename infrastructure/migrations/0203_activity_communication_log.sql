-- ============================================================
-- AURA OS — migration 0203: CRM activity communication log
-- ------------------------------------------------------------
-- Turn an activity into a real communications-log entry. `direction` records who initiated an
-- email/call/whatsapp (inbound vs outbound); `counterparty` is the person/email/number on the
-- other end. Both nullable and only meaningful for communication types — tasks/notes and every
-- legacy row stay null. Additive, backward-compatible. Owned by crm.
-- ============================================================

alter table public.aura_crm_activities add column if not exists direction    text;
alter table public.aura_crm_activities add column if not exists counterparty text;

-- @DOWN
alter table public.aura_crm_activities drop column if exists counterparty;
alter table public.aura_crm_activities drop column if exists direction;

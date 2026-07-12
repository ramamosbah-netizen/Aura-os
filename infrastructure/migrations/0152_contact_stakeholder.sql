-- ============================================================
-- AURA OS — migration 0152: contact stakeholder profile
-- ------------------------------------------------------------
-- Contacts become STAKEHOLDERS: their role in the buying decision, how strong
-- the relationship is, and the account hierarchy (who they report to). All
-- nullable/additive — no backfill needed.
-- ============================================================

alter table public.aura_crm_contacts add column if not exists stakeholder_role      text;
alter table public.aura_crm_contacts add column if not exists relationship_strength text;
alter table public.aura_crm_contacts add column if not exists reports_to_id         text;
alter table public.aura_crm_contacts add column if not exists reports_to_name       text;

-- @DOWN
alter table public.aura_crm_contacts drop column if exists stakeholder_role;
alter table public.aura_crm_contacts drop column if exists relationship_strength;
alter table public.aura_crm_contacts drop column if exists reports_to_id;
alter table public.aura_crm_contacts drop column if exists reports_to_name;

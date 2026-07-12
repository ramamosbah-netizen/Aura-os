-- ============================================================
-- AURA OS — migration 0153: opportunity qualification & win/loss
-- ------------------------------------------------------------
-- The opportunity becomes a real command center: BANT qualification (how well we
-- understand the deal), the competitors we're up against, where it came from, and
-- why we lost. All additive — booleans default false, the rest nullable.
-- ============================================================

alter table public.aura_crm_opportunities add column if not exists budget_confirmed    boolean not null default false;
alter table public.aura_crm_opportunities add column if not exists authority_confirmed boolean not null default false;
alter table public.aura_crm_opportunities add column if not exists need_confirmed      boolean not null default false;
alter table public.aura_crm_opportunities add column if not exists timeline_confirmed  boolean not null default false;
alter table public.aura_crm_opportunities add column if not exists competitors         text;
alter table public.aura_crm_opportunities add column if not exists source              text;
alter table public.aura_crm_opportunities add column if not exists loss_reason         text;

-- @DOWN
alter table public.aura_crm_opportunities drop column if exists budget_confirmed;
alter table public.aura_crm_opportunities drop column if exists authority_confirmed;
alter table public.aura_crm_opportunities drop column if exists need_confirmed;
alter table public.aura_crm_opportunities drop column if exists timeline_confirmed;
alter table public.aura_crm_opportunities drop column if exists competitors;
alter table public.aura_crm_opportunities drop column if exists source;
alter table public.aura_crm_opportunities drop column if exists loss_reason;

-- ============================================================
-- AURA OS — migration 0151: account relationship stage
-- ------------------------------------------------------------
-- The account is the persistent commercial party — its state is the
-- RELATIONSHIP, not a lead funnel. Replaces lead/active/inactive with
-- prospect → qualified → active_customer → strategic · dormant · inactive,
-- mapping existing rows (lead→prospect, active→active_customer).
-- ============================================================

alter table public.aura_crm_accounts
  drop constraint if exists aura_crm_accounts_status_check;

update public.aura_crm_accounts set status = 'prospect' where status = 'lead';
update public.aura_crm_accounts set status = 'active_customer' where status = 'active';

alter table public.aura_crm_accounts
  add constraint aura_crm_accounts_status_check check (status in (
    'prospect','qualified','active_customer','strategic','dormant','inactive'
  ));

-- @DOWN
alter table public.aura_crm_accounts drop constraint if exists aura_crm_accounts_status_check;
update public.aura_crm_accounts set status = 'lead' where status in ('prospect','qualified');
update public.aura_crm_accounts set status = 'active' where status in ('active_customer','strategic');
update public.aura_crm_accounts set status = 'inactive' where status = 'dormant';
alter table public.aura_crm_accounts
  add constraint aura_crm_accounts_status_check check (status in ('lead','active','inactive'));

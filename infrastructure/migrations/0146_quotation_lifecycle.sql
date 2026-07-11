-- ============================================================
-- AURA OS — migration 0146: quotation lifecycle + deal-chain provenance
-- ------------------------------------------------------------
-- Quotations become a real deal-chain member: extended lifecycle
-- (internal review / approval / negotiation / revisions / cancel),
-- revision chain (Rev 0 → 1 → 2 …), source references (opportunity as well
-- as tender), owner, commercial terms, and the contract created from an
-- accepted quotation.
-- ============================================================

alter table public.aura_crm_quotations
  add column if not exists source_opportunity_id uuid,
  add column if not exists owner_id text,
  add column if not exists terms text,
  add column if not exists revision integer not null default 0,
  add column if not exists parent_quotation_id uuid,
  add column if not exists converted_contract_id uuid;

alter table public.aura_crm_quotations
  drop constraint if exists aura_crm_quotations_status_check;

alter table public.aura_crm_quotations
  add constraint aura_crm_quotations_status_check check (status in (
    'draft','internal_review','approved','sent','under_negotiation',
    'revised','accepted','rejected','expired','cancelled'
  ));

-- @DOWN
alter table public.aura_crm_quotations drop constraint if exists aura_crm_quotations_status_check;
alter table public.aura_crm_quotations add constraint aura_crm_quotations_status_check
  check (status in ('draft','sent','accepted','rejected','expired'));
alter table public.aura_crm_quotations
  drop column if exists converted_contract_id,
  drop column if exists parent_quotation_id,
  drop column if exists revision,
  drop column if exists terms,
  drop column if exists owner_id,
  drop column if exists source_opportunity_id;

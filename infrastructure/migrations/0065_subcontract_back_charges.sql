-- ============================================================
-- AURA OS — migration 0065: Subcontractor Back-Charges (contra-charges)
-- ------------------------------------------------------------
-- Costs the main contractor incurs that should be borne by the
-- subcontractor (materials/plant supplied on their behalf, defective-
-- work rectification, attendance, clean-up). Each back-charge carries
-- the raw cost + an admin handling markup, is agreed or disputed by the
-- subcontractor, and is recovered by deducting from their certified
-- claims. References the subcontract by id + name snapshot (no join);
-- the `subcontracts.backcharge.*` events are the recovery seam.
-- ============================================================

create table if not exists public.aura_subcontracts_back_charges (
  id                  uuid          primary key,
  tenant_id           text          not null,
  subcontract_id      uuid          not null,
  subcontractor_name  text,
  reference           text          not null,                  -- e.g. BC-001
  category            text          not null default 'other',  -- materials|plant|labour|rectification|attendance|other
  description         text          not null,
  gross_amount        numeric(18,2) not null default 0,        -- raw cost incurred
  markup_percent      numeric(6,3)  not null default 0,        -- admin handling fee %
  markup_amount       numeric(18,2) not null default 0,
  recoverable_amount  numeric(18,2) not null default 0,        -- gross + markup
  recovered_amount    numeric(18,2) not null default 0,        -- deducted from claims to date
  outstanding_amount  numeric(18,2) not null default 0,
  status              text          not null default 'raised', -- raised|agreed|disputed|recovered|written_off
  raised_at           timestamptz   not null default now(),
  agreed_at           timestamptz,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

create index if not exists idx_aura_sc_back_charges_tenant on public.aura_subcontracts_back_charges (tenant_id, created_at desc);
create index if not exists idx_aura_sc_back_charges_subcontract on public.aura_subcontracts_back_charges (subcontract_id);

alter table public.aura_subcontracts_back_charges enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_subcontracts_back_charges;
create policy tenant_isolation_policy on public.aura_subcontracts_back_charges
  for all using (tenant_id = public.current_tenant_id());

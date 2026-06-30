-- ============================================================
-- AURA OS — migration 0064: Interim Payment Certificates (IPC)
-- ------------------------------------------------------------
-- Progress billing against a main contract. Each certificate is
-- cumulative ("to date"): the contractor applies for work done,
-- the engineer certifies it, retention is held (capped at a % of
-- contract value), advance is recovered, and the net of prior
-- certificates is deducted — leaving the amount payable this
-- period. References the contract + CRM account by id + snapshot
-- (no join); the `contracts.ipc.certified` event drives finance AR.
-- ============================================================

create table if not exists public.aura_contracts_payment_certificates (
  id                         uuid          primary key,
  tenant_id                  text          not null,
  company_id                 text,
  contract_id                text          not null,
  contract_title             text,
  contract_value             numeric(18,2) not null default 0,
  account_id                 text,
  account_name               text,
  sequence                   integer       not null,                 -- IPC number within the contract
  reference                  text,                                   -- e.g. IPC-001
  period_start               date,
  period_end                 date,
  cumulative_work_done       numeric(18,2) not null default 0,       -- gross work executed to date
  materials_on_site          numeric(18,2) not null default 0,
  retention_percent          numeric(6,3)  not null default 0,
  retention_cap_percent      numeric(6,3)  not null default 0,       -- 0 = uncapped
  advance_recovered_to_date  numeric(18,2) not null default 0,
  previous_certified_net     numeric(18,2) not null default 0,
  gross_to_date              numeric(18,2) not null default 0,
  retention_to_date          numeric(18,2) not null default 0,
  net_certified_to_date      numeric(18,2) not null default 0,
  net_this_certificate       numeric(18,2) not null default 0,
  status                     text          not null default 'draft', -- draft|submitted|certified|paid|rejected
  created_by                 text,
  certified_by               text,
  certified_at               timestamptz,
  created_at                 timestamptz   not null default now()
);
create index if not exists idx_aura_ipc_contract on public.aura_contracts_payment_certificates (tenant_id, contract_id, sequence);
create unique index if not exists uq_aura_ipc_contract_seq on public.aura_contracts_payment_certificates (tenant_id, contract_id, sequence);

alter table public.aura_contracts_payment_certificates enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_contracts_payment_certificates;
create policy tenant_isolation_policy on public.aura_contracts_payment_certificates
  for all using (tenant_id = public.current_tenant_id());

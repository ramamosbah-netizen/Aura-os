-- ============================================================
-- AURA OS — migration 0396: a service contract opened from a handover says where it came from
-- ------------------------------------------------------------
-- J6-01: accepting a handover opened an AMC contract that carried no project and no handover, and
-- wrote the PROJECT's name into client_name. The contract now records:
--
--   source        'manual' (entered on the AMC screen) or 'handover' (opened by the acceptance)
--   project_id    the project delivered, and project_name as it read at acceptance
--   handover_id   the accepted handover — at most ONE contract per handover, enforced here, so an
--                 at-least-once re-delivery of the event cannot open a second contract
--   account_id    the customer, from the project's canonical account (null when the project names
--                 none; the contract then says so rather than borrowing another name)
--
-- Contracts opened before this migration are left as they are: which of them came from a handover
-- can only be guessed from their number, and a guess written into a lineage column is not lineage.
-- ============================================================

alter table public.aura_amc_service_contracts
  add column if not exists source text not null default 'manual',
  add column if not exists project_id uuid,
  add column if not exists project_name text,
  add column if not exists handover_id uuid,
  add column if not exists account_id uuid;

alter table public.aura_amc_service_contracts
  drop constraint if exists aura_amc_contracts_source_chk;
alter table public.aura_amc_service_contracts
  add constraint aura_amc_contracts_source_chk check (source in ('manual', 'handover'));

-- A contract that says it came from a handover names the handover and the project.
alter table public.aura_amc_service_contracts
  drop constraint if exists aura_amc_contracts_handover_lineage_chk;
alter table public.aura_amc_service_contracts
  add constraint aura_amc_contracts_handover_lineage_chk
  check (source <> 'handover' or (handover_id is not null and project_id is not null));

create unique index if not exists aura_amc_contracts_one_per_handover
  on public.aura_amc_service_contracts (tenant_id, handover_id)
  where handover_id is not null;

create index if not exists aura_amc_contracts_project
  on public.aura_amc_service_contracts (tenant_id, project_id)
  where project_id is not null;

-- @DOWN
drop index if exists public.aura_amc_contracts_project;
drop index if exists public.aura_amc_contracts_one_per_handover;
alter table public.aura_amc_service_contracts drop constraint if exists aura_amc_contracts_handover_lineage_chk;
alter table public.aura_amc_service_contracts drop constraint if exists aura_amc_contracts_source_chk;
alter table public.aura_amc_service_contracts
  drop column if exists account_id,
  drop column if exists handover_id,
  drop column if exists project_name,
  drop column if exists project_id,
  drop column if exists source;

-- ============================================================
-- AURA OS — migration 0230: AMC work-order SLA outcome
-- ------------------------------------------------------------
-- Part of closing the last of gap G-08 (fleet / assets / amc).
--
-- The work order now walks a guarded lifecycle (open → assigned → in_progress → completed) rather
-- than flipping a status field, and two things are recorded that previously were not:
--
--   * started_date          — when the technician actually began, distinct from scheduled_date
--   * sla_resolution_hours  — the SLA that applied AT THE TIME, copied from the governing contract
--   * resolution_hours      — measured elapsed hours from raising to completion
--   * sla_met               — the outcome, stamped once at completion
--
-- The SLA terms are snapshotted onto the order rather than re-read from the contract on every
-- query: contract terms change, and afterwards what matters is whether THIS visit met the SLA that
-- governed it. A recomputed number would quietly re-judge history.
--
-- Additive, nullable columns on a table owned by the AMC module. Work orders completed before this
-- migration keep a null outcome, which reads correctly as "not measured" rather than "missed".
-- ============================================================

alter table public.aura_amc_work_orders
  add column if not exists started_date         timestamptz,
  add column if not exists sla_resolution_hours integer,
  add column if not exists resolution_hours     numeric(10,2),
  add column if not exists sla_met              boolean;

-- The SLA-breach view filters completed orders by outcome.
create index if not exists idx_amc_work_orders_sla_met
  on public.aura_amc_work_orders (tenant_id, sla_met)
  where sla_met is not null;

-- @DOWN
drop index if exists idx_amc_work_orders_sla_met;

alter table public.aura_amc_work_orders
  drop column if exists started_date,
  drop column if exists sla_resolution_hours,
  drop column if exists resolution_hours,
  drop column if exists sla_met;

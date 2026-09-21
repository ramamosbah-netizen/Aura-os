-- ============================================================
-- AURA OS — migration 0375: four departments that nobody could operate, and an AI that could
--                           act on the business twice
--                           (SEC-01 stage 3, wave F — amc, assets, fleet, intelligence)
-- ------------------------------------------------------------
-- FOUR ENTIRE MODULES HELD NO WRITE PERMISSION ON ANY SHIPPED ROLE. Measured across the 26-role
-- catalogue, excluding the administrator:
--
--   amc           14 mutating routes   roles holding any write: NONE
--   fleet         16                   NONE
--   assets         8                   NONE
--   intelligence   7                   NONE
--
-- This is the shape wave C found in document control and wave A found in HR, four times over at
-- once. Terminating a maintenance contract, disposing of a company asset, paying a traffic fine and
-- executing an AI proposal against the business were all administrator-only, not because anyone
-- decided they should be, but because nobody had ever written the roles down.
--
-- AND THE RECORDS MATCH. Measured column by column:
--
--   aura_amc_service_contracts   status, and no actor on termination
--   aura_amc_work_orders         completed_date, started_date, and NO ACTOR ANYWHERE
--   aura_amc_tickets             resolved_at with no resolved_by
--   aura_assets                  status, deleted_at, and no actor on disposal
--   aura_asset_maintenance       status, and no actor at all — not even created_by
--   aura_fleet_maintenance       the same
--   aura_fleet_traffic_fines     paid_date with no paid_by, and a fine ASSIGNED TO A DRIVER by
--                                nobody — a person is charged and the record does not say who
--                                charged them
--
-- THE AUTONOMY PROPOSAL IS THE SHARPEST OF THEM. `aura_autonomy_proposals` carries `decided_by`
-- and `decided_at` and NO `proposed_by`: the service's `propose()` accepts an `actorId` and drops
-- it on the floor, so the record of a change the AI wants to make to the business does not say who
-- asked for it. Worse, `execute` and `reject` are bare updates with NO STATUS GUARD:
--
--   UPDATE aura_autonomy_proposals SET status = 'executed', decided_by = $3, decided_at = now()
--   WHERE id = $1 AND tenant_id = $2
--
-- so an executed proposal can be executed again, and a REJECTED proposal can still be executed.
-- There is no state machine and there was no permission check in the service either; the only gate
-- was a route name no role reached.
-- ============================================================

-- ── INTELLIGENCE ────────────────────────────────────────────────────────────
alter table public.aura_autonomy_proposals
  add column if not exists proposed_by text,
  add column if not exists proposed_at timestamptz;

comment on column public.aura_autonomy_proposals.proposed_by is
  'Who (or what) asked for the change. `propose()` already took an actorId and discarded it, so a proposal to act on the business recorded its decider and never its origin.';

-- ── AMC ─────────────────────────────────────────────────────────────────────
alter table public.aura_amc_service_contracts
  add column if not exists created_by          text,
  add column if not exists terminated_by       text,
  add column if not exists terminated_at       timestamptz,
  add column if not exists termination_reason  text;

alter table public.aura_amc_work_orders
  add column if not exists created_by    text,
  add column if not exists completed_by  text,
  add column if not exists cancelled_by  text,
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancellation_reason text;

alter table public.aura_amc_tickets
  add column if not exists resolved_by text;

-- ── ASSETS ──────────────────────────────────────────────────────────────────
alter table public.aura_assets
  add column if not exists created_by  text,
  add column if not exists disposed_by text,
  add column if not exists disposed_at timestamptz;

alter table public.aura_asset_maintenance
  add column if not exists created_by   text,
  add column if not exists completed_by text,
  add column if not exists completed_at timestamptz;

-- ── FLEET ───────────────────────────────────────────────────────────────────
alter table public.aura_fleet_maintenance
  add column if not exists created_by   text,
  add column if not exists completed_by text,
  add column if not exists completed_at timestamptz;

alter table public.aura_fleet_traffic_fines
  add column if not exists created_by  text,
  add column if not exists assigned_by text,
  add column if not exists assigned_at timestamptz,
  add column if not exists paid_by     text;

comment on column public.aura_fleet_traffic_fines.assigned_by is
  'Who charged this fine to the driver. `driver_employee_id` says WHO PAYS; this says who decided that, and it did not exist — a person was charged by nobody.';

-- ── INVARIANTS ──────────────────────────────────────────────────────────────
-- Each pair is all-or-nothing, and each exempts history through the `… is null` branch: rows
-- written before the columns existed carry neither, and inferring an actor from `created_by` would
-- manufacture the very self-act these exist to stop recording silently.
--
-- The `is not null` tests are written out rather than leaning on `btrim(x) <> ''`, which evaluates
-- to NULL when x is NULL: `FALSE OR NULL` is NULL and a CHECK PASSES on NULL. That hole shipped
-- once, in 0362, and was caught only by its own test.

alter table public.aura_amc_service_contracts
  drop constraint if exists aura_amc_contract_terminated_complete;
alter table public.aura_amc_service_contracts
  add constraint aura_amc_contract_terminated_complete check (
    (terminated_by is null and terminated_at is null and termination_reason is null)
    or (
      terminated_by is not null
      and terminated_at is not null
      and termination_reason is not null
      and btrim(termination_reason) <> ''
    )
  );

alter table public.aura_amc_work_orders
  drop constraint if exists aura_amc_wo_cancelled_complete;
alter table public.aura_amc_work_orders
  add constraint aura_amc_wo_cancelled_complete check (
    (cancelled_by is null and cancelled_at is null)
    or (cancelled_by is not null and cancelled_at is not null)
  );

-- A COMPLETED WORK ORDER AND A CANCELLED ONE ARE DIFFERENT OUTCOMES. Recording both would say the
-- work was done and abandoned.
alter table public.aura_amc_work_orders
  drop constraint if exists aura_amc_wo_outcome_exclusive;
alter table public.aura_amc_work_orders
  add constraint aura_amc_wo_outcome_exclusive check (
    cancelled_at is null or completed_by is null
  ) not valid;

alter table public.aura_assets
  drop constraint if exists aura_assets_disposed_complete;
alter table public.aura_assets
  add constraint aura_assets_disposed_complete check (
    (disposed_by is null and disposed_at is null)
    or (disposed_by is not null and disposed_at is not null)
  );

alter table public.aura_asset_maintenance
  drop constraint if exists aura_asset_maintenance_completed_complete;
alter table public.aura_asset_maintenance
  add constraint aura_asset_maintenance_completed_complete check (
    (completed_by is null and completed_at is null)
    or (completed_by is not null and completed_at is not null)
  );

alter table public.aura_fleet_maintenance
  drop constraint if exists aura_fleet_maintenance_completed_complete;
alter table public.aura_fleet_maintenance
  add constraint aura_fleet_maintenance_completed_complete check (
    (completed_by is null and completed_at is null)
    or (completed_by is not null and completed_at is not null)
  );

-- A FINE CHARGED TO A DRIVER SAYS WHO CHARGED THEM.
alter table public.aura_fleet_traffic_fines
  drop constraint if exists aura_fleet_fine_assigned_complete;
alter table public.aura_fleet_traffic_fines
  add constraint aura_fleet_fine_assigned_complete check (
    (assigned_by is null and assigned_at is null)
    or (assigned_by is not null and assigned_at is not null)
  );

-- INVARIANT — THE PROPOSER DOES NOT EXECUTE THEIR OWN PROPOSAL.
-- An AI proposal is a suggested change to the business; a human applying it is the control on that
-- suggestion, and one account doing both removes the control while leaving the paperwork.
--
-- `NOT VALID`: rows on disk predate `proposed_by` entirely, so none can satisfy a comparison
-- against it. The rule binds on every insert and update from here on while the history stays
-- readable. Once the affected proposals have aged out:
--
--   ALTER TABLE public.aura_autonomy_proposals VALIDATE CONSTRAINT aura_autonomy_propose_not_execute;
alter table public.aura_autonomy_proposals
  drop constraint if exists aura_autonomy_propose_not_execute;
alter table public.aura_autonomy_proposals
  add constraint aura_autonomy_propose_not_execute check (
    status <> 'executed' or decided_by is null or proposed_by is null or decided_by <> proposed_by
  ) not valid;

-- INVARIANT — a decided proposal says who decided it and when.
alter table public.aura_autonomy_proposals
  drop constraint if exists aura_autonomy_decided_complete;
alter table public.aura_autonomy_proposals
  add constraint aura_autonomy_decided_complete check (
    (decided_by is null and decided_at is null)
    or (decided_by is not null and decided_at is not null)
  );

create index if not exists idx_aura_autonomy_proposals_status
  on public.aura_autonomy_proposals (tenant_id, status);

-- @DOWN
drop index if exists idx_aura_autonomy_proposals_status;
alter table public.aura_autonomy_proposals      drop constraint if exists aura_autonomy_decided_complete;
alter table public.aura_autonomy_proposals      drop constraint if exists aura_autonomy_propose_not_execute;
alter table public.aura_fleet_traffic_fines     drop constraint if exists aura_fleet_fine_assigned_complete;
alter table public.aura_fleet_maintenance       drop constraint if exists aura_fleet_maintenance_completed_complete;
alter table public.aura_asset_maintenance       drop constraint if exists aura_asset_maintenance_completed_complete;
alter table public.aura_assets                  drop constraint if exists aura_assets_disposed_complete;
alter table public.aura_amc_work_orders         drop constraint if exists aura_amc_wo_outcome_exclusive;
alter table public.aura_amc_work_orders         drop constraint if exists aura_amc_wo_cancelled_complete;
alter table public.aura_amc_service_contracts   drop constraint if exists aura_amc_contract_terminated_complete;
alter table public.aura_fleet_traffic_fines drop column if exists paid_by;
alter table public.aura_fleet_traffic_fines drop column if exists assigned_at;
alter table public.aura_fleet_traffic_fines drop column if exists assigned_by;
alter table public.aura_fleet_traffic_fines drop column if exists created_by;
alter table public.aura_fleet_maintenance   drop column if exists completed_at;
alter table public.aura_fleet_maintenance   drop column if exists completed_by;
alter table public.aura_fleet_maintenance   drop column if exists created_by;
alter table public.aura_asset_maintenance   drop column if exists completed_at;
alter table public.aura_asset_maintenance   drop column if exists completed_by;
alter table public.aura_asset_maintenance   drop column if exists created_by;
alter table public.aura_assets              drop column if exists disposed_at;
alter table public.aura_assets              drop column if exists disposed_by;
alter table public.aura_assets              drop column if exists created_by;
alter table public.aura_amc_tickets         drop column if exists resolved_by;
alter table public.aura_amc_work_orders     drop column if exists cancellation_reason;
alter table public.aura_amc_work_orders     drop column if exists cancelled_at;
alter table public.aura_amc_work_orders     drop column if exists cancelled_by;
alter table public.aura_amc_work_orders     drop column if exists completed_by;
alter table public.aura_amc_work_orders     drop column if exists created_by;
alter table public.aura_amc_service_contracts drop column if exists termination_reason;
alter table public.aura_amc_service_contracts drop column if exists terminated_at;
alter table public.aura_amc_service_contracts drop column if exists terminated_by;
alter table public.aura_amc_service_contracts drop column if exists created_by;
alter table public.aura_autonomy_proposals  drop column if exists proposed_at;
alter table public.aura_autonomy_proposals  drop column if exists proposed_by;

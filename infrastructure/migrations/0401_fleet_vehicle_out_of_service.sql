-- ============================================================
-- 0401 — A VEHICLE CAN BE TAKEN OUT OF SERVICE, AND SAYS SINCE WHEN AND WHY (F-08)
--
-- A vehicle's status could be chosen once, when it was registered, and never again. A van that
-- broke down stayed `active` in the register, so the bookings planners had committed against it
-- stayed AVAILABLE — the availability bridge (resource-availability.provider.ts) already reads an
-- out-of-service vehicle as UNKNOWN from today, and nothing could ever put one there.
--
-- Now the Fleet administrator takes a vehicle out of service with a stated reason, and returns it
-- to service when it is back. The vehicle carries the day it went out and the reason, so a planner
-- whose commitment just became uncertain reads "out of service since 2026-10-01: gearbox failure"
-- in the register's own words rather than a bare status.
--
-- THE PAIR IS ALL OR NOTHING, AND ONLY WHILE OUT OF SERVICE. A reason without a date, a date
-- without a reason, a blank reason, or either on a vehicle that is not in `maintenance` is refused
-- by the table, whatever writes it. A vehicle REGISTERED as under maintenance before this migration
-- keeps a null pair: nobody recorded why, and a back-filled reason would be evidence nobody kept.
-- ============================================================

alter table public.aura_fleet_vehicles
  add column if not exists out_of_service_since  date,
  add column if not exists out_of_service_reason text;

alter table public.aura_fleet_vehicles
  drop constraint if exists chk_aura_fleet_vehicle_out_of_service;

alter table public.aura_fleet_vehicles
  add constraint chk_aura_fleet_vehicle_out_of_service check (
    (out_of_service_since is null and out_of_service_reason is null)
    or (
      status = 'maintenance'
      and out_of_service_since is not null
      and out_of_service_reason is not null
      and length(btrim(out_of_service_reason)) > 0
    )
  );

-- @DOWN
alter table public.aura_fleet_vehicles drop constraint if exists chk_aura_fleet_vehicle_out_of_service;
alter table public.aura_fleet_vehicles drop column if exists out_of_service_reason;
alter table public.aura_fleet_vehicles drop column if exists out_of_service_since;

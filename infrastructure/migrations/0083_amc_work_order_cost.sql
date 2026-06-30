-- ============================================================
-- AURA OS — migration 0083: AMC work-order billable cost
-- ------------------------------------------------------------
-- Captures the billable amount on a completed work order; the
-- amc.workorder.completed event drives the AMC → AR invoice reactor.
-- ============================================================

alter table public.aura_amc_work_orders
  add column if not exists cost numeric(15,2);

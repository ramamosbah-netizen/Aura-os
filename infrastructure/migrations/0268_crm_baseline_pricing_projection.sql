-- ============================================================
-- AURA OS — migration 0268: freeze pricing projection in Commercial Baseline
-- ------------------------------------------------------------
-- Approved margin/reporting must not drift when a quotation's draft pricing is later edited or a
-- revision is opened. Existing baselines pre-date this projection and remain explicitly unknown
-- for cost/margin until backfilled; they must not be treated as zero.
-- ============================================================

alter table public.aura_crm_commercial_baselines
  add column if not exists pricing jsonb,
  add column if not exists estimation jsonb;

-- @DOWN
alter table public.aura_crm_commercial_baselines
  drop column if exists pricing,
  drop column if exists estimation;

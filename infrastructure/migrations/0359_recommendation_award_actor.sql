-- ============================================================
-- AURA OS — migration 0359: who executed the award, and when (SUP-14)
-- ------------------------------------------------------------
-- The award is a distinct act from the approval, by a distinct person on a distinct day, and until
-- now the record kept only that the recommendation had become `awarded`. The same separation
-- migration 0356 drew between deciding and withdrawing applies here: `decided_by` is who APPROVED
-- the commitment, and overwriting it with whoever later executed the award would erase the approval
-- for the second time in this record's history.
--
-- It is also what the conditional claim writes. `UPDATE ... SET status='awarded', awarded_by=$
-- WHERE status='approved'` is the single statement that decides which of two concurrent awards wins,
-- so the row carries the answer: the winner is named on it.
-- ============================================================

alter table public.aura_procurement_sourcing_recommendations
  add column if not exists awarded_by text,
  add column if not exists awarded_at timestamptz;

comment on column public.aura_procurement_sourcing_recommendations.awarded_by is
  'Who executed the award. Written by the conditional claim that moves approved → awarded, so it names the request that won. Never overwrites decided_by, which is who approved it.';

-- @DOWN
alter table public.aura_procurement_sourcing_recommendations
  drop column if exists awarded_at,
  drop column if exists awarded_by;

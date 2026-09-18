-- ============================================================
-- AURA OS — migration 0356: withdrawing a recommendation does not erase the decision (SUP-13)
-- ------------------------------------------------------------
-- Migration 0355 gave an approved recommendation a way to be stood down, which it needed: SUP-14
-- refuses to award a stale one, and without withdrawal that recommendation could neither be awarded,
-- nor decided again, nor replaced.
--
-- But the withdrawal was written into `decided_by` / `decided_at` / `decision_note` — the columns
-- that hold WHO APPROVED IT AND WHEN. So standing down an approved recommendation overwrote the
-- approval that had been given, and the record afterwards said only that somebody withdrew it. The
-- approver's act disappeared from the one place it was recorded.
--
-- That is precisely backwards. A withdrawal is a LATER fact ABOUT a decision, not a replacement for
-- it: "this was approved by X on the 10th, and stood down by Y on the 14th because the supplier
-- revised their offer" is one story, and it is the story an auditor needs. Two acts, two records.
-- ============================================================

alter table public.aura_procurement_sourcing_recommendations
  -- Who stood it down, when, and why. Separate from the decision, which stays exactly as it was.
  add column if not exists withdrawn_by     text,
  add column if not exists withdrawn_at     timestamptz,
  add column if not exists withdrawal_reason text;

comment on column public.aura_procurement_sourcing_recommendations.withdrawal_reason is
  'Why this recommendation was stood down. Required to withdraw. Never overwrites decision_note: the approval and the withdrawal are two facts, and both are kept.';
comment on column public.aura_procurement_sourcing_recommendations.decided_by is
  'Who approved, rejected or returned it. A withdrawal does NOT touch this — see withdrawn_by.';

-- @DOWN
alter table public.aura_procurement_sourcing_recommendations
  drop column if exists withdrawal_reason,
  drop column if exists withdrawn_at,
  drop column if exists withdrawn_by;

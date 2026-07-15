-- ============================================================
-- AURA OS — migration 0170: CRM Lead Qualification Engine (G3)
-- ------------------------------------------------------------
-- Gives the Lead OS its missing half. leadAttention() (0156) answers "is anyone WORKING this
-- lead?"; nothing answered "is there a real commercial opportunity here, worth qualifying?".
-- This records the assessment behind that judgement:
--   qualification_dimensions      — jsonb map of the eight 0–100 dimensions (fit, intent,
--                                   need confidence, timing, authority access, commercial
--                                   potential, relationship strength, information quality).
--                                   A missing key means UNRATED, which is not the same as 0 —
--                                   the engine ignores it and reports lower confidence instead.
--   qualification_notes           — the qualifier's own words behind the numbers
--   qualification_assessed_at/by  — who judged, and when (governance: a score with no author
--                                   cannot be challenged)
--
-- Deliberately NO score/recommendation column. Both are pure functions of the dimensions
-- (assessLeadQualification), so storing them would create exactly the second-truth problem G2
-- just removed from opportunity.nextAction: a cached score drifts the moment the rules change.
-- The human's actual decision is already stored — it is the lead's STATUS.
--
-- Mirrors 0161's pursuit_dimensions jsonb on the opportunity: same idiom, one level up.
-- All additive + nullable — every existing lead reads as unassessed (score 0, LOW confidence,
-- recommendation REVIEW), which is the honest description of a lead nobody has qualified.
-- ============================================================

alter table public.aura_crm_leads
  add column if not exists qualification_dimensions  jsonb,
  add column if not exists qualification_notes       text,
  add column if not exists qualification_assessed_at timestamptz,
  add column if not exists qualification_assessed_by text;

-- @DOWN
alter table public.aura_crm_leads
  drop column if exists qualification_dimensions,
  drop column if exists qualification_notes,
  drop column if exists qualification_assessed_at,
  drop column if exists qualification_assessed_by;

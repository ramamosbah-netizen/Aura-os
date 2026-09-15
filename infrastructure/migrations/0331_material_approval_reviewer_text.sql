-- ============================================================
-- AURA OS — migration 0331: recording WHO approved a material must not fail on Postgres.
-- ------------------------------------------------------------
-- Platform actor ids are TEXT — "u-admin", "sa:<id>". `aura_quality_material_approvals.reviewed_by`
-- was typed uuid, so every consultant decision on a real database failed with
--
--     invalid input syntax for type uuid: "u-admin"
--
-- and the attribution the whole capability rests on could not be written at all. An approved
-- material that cannot say who approved it is the defect ENG-04 exists to close, and here it was
-- not a design gap but a column type.
--
-- THIS IS THE THIRD TIME THIS DEFECT HAS BEEN FIXED. Migration 0142 corrected it for quotations;
-- 0150 corrected it for sixteen more tables and named 0142 as the same defect resurfacing — and
-- 0150 converted `created_by` ONLY, by its own title. It converted `created_by` on THIS table and
-- left `reviewed_by` beside it untouched. Nothing swept the other actor columns, which is why it
-- came back.
--
-- Only in-memory tests exercised this path, and they do not type-check a column. It took an Auth-ON
-- browser run against PostgreSQL to surface it, which is precisely what that layer is for.
--
-- NOT fixed here, and recorded instead: four more actor columns are still typed uuid and will fail
-- the same way on their own approve paths —
--
--     aura_hr_expense_claims.approved_by
--     aura_hr_staff_advances.approved_by
--     aura_hr_timesheets.approved_by
--     aura_subcontracts_variations.approved_by
--
-- They belong to HR and Subcontracts capabilities, not to ENG-04, and converting them blind without
-- their own proofs is how a scoped fix becomes an unreviewed change to four other journeys.
-- (`auth_refresh_tokens.replaced_by` is also uuid and is CORRECT: it holds a token id, not an actor.)
-- ============================================================

ALTER TABLE public.aura_quality_material_approvals
  ALTER COLUMN reviewed_by TYPE text USING reviewed_by::text;

-- @DOWN
-- Deliberately not reverted to uuid: the values it now holds are actor ids, which are not uuids, so
-- a cast back would fail on any row that recorded a real decision.

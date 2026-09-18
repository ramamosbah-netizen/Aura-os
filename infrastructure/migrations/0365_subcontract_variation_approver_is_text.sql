-- ============================================================
-- AURA OS — migration 0365: a subcontract variation can actually be approved
-- ------------------------------------------------------------
-- `aura_subcontracts_variations.approved_by` is UUID. Every other actor column in this system is
-- TEXT — `certified_by`, `created_by`, `paid_by`, `decided_by`, `closed_by`, `approved_by` on the
-- CRM solution scope — because AURA user ids are strings like `u-admin`, not UUIDs.
--
-- So approving a subcontract variation has NEVER WORKED for a real user. Measured against the
-- running API, before this migration and with the old build:
--
--   201  POST   subcontracts/variations
--   400  PATCH  subcontracts/variations/:id/approve
--          invalid input syntax for type uuid: "u-admin"
--
-- The only actor the column ever accepted was the nil UUID the service substituted when nobody was
-- authenticated — `approveVariation(existing, actorId ?? '00000000-0000-0000-0000-000000000000')` —
-- which is why this survived: the one code path that worked was the one with no actor in it. A raw
-- PostgreSQL type error was reaching the client as a 400, so it did not even read as a defect.
--
-- It matters beyond the column. Approving a variation ADDS its signed amount to the subcontract
-- value, and that value is the ceiling every certification is now measured against. A variation that
-- cannot be approved is a ceiling that cannot be raised.
-- ============================================================

-- Widening, so no value can fail to convert; existing nil-UUID rows become the string form and stay
-- legible as what they are — approvals recorded against nobody.
alter table public.aura_subcontracts_variations
  alter column approved_by type text using approved_by::text;

comment on column public.aura_subcontracts_variations.approved_by is
  'Who approved it. TEXT, like every other actor column: AURA user ids are strings, and this was UUID, which made approval impossible for any real user.';

-- @DOWN
-- Deliberately not reversible. Going back to uuid would fail on every row holding a real user id,
-- and succeeding would mean those rows had been deleted.

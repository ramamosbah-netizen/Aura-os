-- ============================================================
-- AURA OS — migration 0369: an expense claim, a staff advance and a timesheet can actually be approved
-- ------------------------------------------------------------
-- `approved_by` is UUID on all three of these tables. Every other actor column in HR — and in the
-- system — is TEXT, because AURA user ids are strings like `u-admin`, not UUIDs. The columns added
-- one migration earlier (0368) are text; these three predate them and are not.
--
-- So APPROVING AN EXPENSE CLAIM HAS NEVER WORKED FOR ANY USER AT ALL. Measured against the running
-- API, as an administrator, with everything else in the chain succeeding:
--
--   201  POST hr/expense-claims                  status=draft
--   201  POST hr/expense-claims/:id/submit       submittedBy=u-admin
--   400  POST hr/expense-claims/:id/approve      invalid input syntax for type uuid: "u-admin"
--
-- This is the THIRD time this exact defect has surfaced: `aura_subcontracts_variations.approved_by`
-- was the same (migration 0365), and it survived there for the same reason it survived here — the
-- module was reachable only through an administrator's wildcard, so the broken path was one almost
-- nobody walked, and the raw PostgreSQL type error reached the client as a 400 that read like bad
-- input rather than like a defect.
--
-- A wildcard does not only over-grant. It hides whether the thing it grants works.
-- ============================================================

-- Widening, so no existing value can fail to convert. Rows holding the nil UUID keep it as a string
-- and stay legible as what they are: approvals recorded against nobody.
alter table public.aura_hr_expense_claims
  alter column approved_by type text using approved_by::text;
alter table public.aura_hr_staff_advances
  alter column approved_by type text using approved_by::text;
alter table public.aura_hr_timesheets
  alter column approved_by type text using approved_by::text;

comment on column public.aura_hr_expense_claims.approved_by is
  'Who approved it. TEXT, like every other actor column: AURA user ids are strings, and this was UUID, which made approval impossible for every real user.';

-- @DOWN
-- Deliberately not reversible. Going back to uuid would fail on every row holding a real user id,
-- and succeeding would mean those rows had been deleted.

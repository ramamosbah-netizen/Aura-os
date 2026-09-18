-- ============================================================
-- AURA OS — migration 0368: an expense claim, a staff advance and a timesheet say who acted on them
--                           (SEC-01 stage 3, wave A)
-- ------------------------------------------------------------
-- MEASURED: NO SHIPPED ROLE HOLDS A SINGLE `hr.*` PERMISSION except `r-hse`, which holds
-- `hr.*.read`. The entire HR module — payroll, expense claims, staff advances, timesheets,
-- appraisals, end-of-service — is reachable only through r-admin's global wildcard, and there is no
-- HR role in the catalogue at all. 28 mutating routes, nine of them governing verbs.
--
-- The records match. All three of these carry `approved_by` and nothing else:
--
--   * WHO SUBMITTED is not recorded. `submitClaim`, `submitTimesheet` and the advance request take
--     no actor, so a claim moves to `submitted` with nobody named.
--   * WHO REJECTED is not recorded at all. `rejectClaim(claim)` and `rejectAdvance(a)` take no
--     actor — a refusal that costs an employee money, attributable to nobody.
--   * WHO PAID is not recorded. `reimburseClaim` and `disburseAdvance` keep a DATE and no actor,
--     which is the money actually leaving.
--   * AND NOTHING STOPS THE CLAIMANT APPROVING THEIR OWN CLAIM. `approveClaim(claim, approverId)`
--     never compares `approverId` against `employeeId`, though the record has held the claimant's
--     identity all along — so unlike the purchase order (0360), the solution scope (0361) and the
--     subcontractor claim (0364), the rule here was WRITEABLE and simply was not written.
--
-- `employee_id` is the claimant on all three. What was missing is the ACTOR on each transition, which
-- is what this adds — and see the note at the foot of this file for why the self-approval comparison
-- is NOT expressed as a constraint here.
-- ============================================================

alter table public.aura_hr_expense_claims
  add column if not exists submitted_by   text,
  add column if not exists submitted_at   timestamptz,
  add column if not exists rejected_by    text,
  add column if not exists rejected_at    timestamptz,
  add column if not exists reimbursed_by  text;

alter table public.aura_hr_staff_advances
  add column if not exists rejected_by   text,
  add column if not exists rejected_at   timestamptz,
  add column if not exists disbursed_by  text;

alter table public.aura_hr_timesheets
  add column if not exists submitted_by text,
  add column if not exists submitted_at timestamptz,
  add column if not exists rejected_by  text,
  add column if not exists rejected_at  timestamptz;

comment on column public.aura_hr_expense_claims.reimbursed_by is
  'Who released the reimbursement. The row kept a DATE and no actor, which is the money leaving with nobody attached to it.';
comment on column public.aura_hr_staff_advances.disbursed_by is
  'Who disbursed the advance. Same silence as the reimbursement, on the same kind of act.';
comment on column public.aura_hr_expense_claims.rejected_by is
  'Who refused it. A rejection costs an employee money and was attributable to nobody at all.';

-- INVARIANT — each transition's provenance is all-or-nothing, on all three records. A row that says
-- it was rejected while refusing to name who, or when, is a refusal with nobody behind it.
alter table public.aura_hr_expense_claims
  drop constraint if exists aura_hr_claim_submitted_complete;
alter table public.aura_hr_expense_claims
  add constraint aura_hr_claim_submitted_complete check (
    (submitted_by is null and submitted_at is null) or (submitted_by is not null and submitted_at is not null)
  );
alter table public.aura_hr_expense_claims
  drop constraint if exists aura_hr_claim_rejected_complete;
alter table public.aura_hr_expense_claims
  add constraint aura_hr_claim_rejected_complete check (
    (rejected_by is null and rejected_at is null) or (rejected_by is not null and rejected_at is not null)
  );

alter table public.aura_hr_staff_advances
  drop constraint if exists aura_hr_advance_rejected_complete;
alter table public.aura_hr_staff_advances
  add constraint aura_hr_advance_rejected_complete check (
    (rejected_by is null and rejected_at is null) or (rejected_by is not null and rejected_at is not null)
  );

alter table public.aura_hr_timesheets
  drop constraint if exists aura_hr_timesheet_submitted_complete;
alter table public.aura_hr_timesheets
  add constraint aura_hr_timesheet_submitted_complete check (
    (submitted_by is null and submitted_at is null) or (submitted_by is not null and submitted_at is not null)
  );
alter table public.aura_hr_timesheets
  drop constraint if exists aura_hr_timesheet_rejected_complete;
alter table public.aura_hr_timesheets
  add constraint aura_hr_timesheet_rejected_complete check (
    (rejected_by is null and rejected_at is null) or (rejected_by is not null and rejected_at is not null)
  );

-- INVARIANT — money does not leave a claim or an advance that nobody approved. Both already refuse
-- it in the domain; this is the database refusing it too. Historical rows are exempt by construction:
-- `reimbursed_by`/`disbursed_by` did not exist, so the branch that binds is the APPROVAL, which did.
alter table public.aura_hr_expense_claims
  drop constraint if exists aura_hr_claim_paid_after_approval;
alter table public.aura_hr_expense_claims
  add constraint aura_hr_claim_paid_after_approval check (
    reimbursed_by is null or approved_by is not null
  );
alter table public.aura_hr_staff_advances
  drop constraint if exists aura_hr_advance_paid_after_approval;
alter table public.aura_hr_staff_advances
  add constraint aura_hr_advance_paid_after_approval check (
    disbursed_by is null or approved_by is not null
  );

-- THE CLAIMANT IS NOT THE APPROVER — AND THAT RULE IS NOT WRITTEN HERE, deliberately.
--
-- The obvious constraint is `approved_by <> employee_id`. It does not compile: `employee_id` is a
-- UUID (the employee RECORD) and `approved_by` is TEXT (a USER id such as `u-admin`). They are
-- different identifiers for different things, joined by the employee/account link, so a constraint
-- comparing them would either fail to build — which is how this was found — or, with a cast bolted
-- on, compile and then never fire for any real user.
--
-- A check that silently never binds is worse than no check: it reads in the schema as a control and
-- is not one. So the rule lives in the domain, where the link can be resolved, and this migration
-- claims only what it can enforce: that each transition names who performed it, and that money never
-- leaves something nobody approved.

-- @DOWN
alter table public.aura_hr_staff_advances  drop constraint if exists aura_hr_advance_paid_after_approval;
alter table public.aura_hr_expense_claims  drop constraint if exists aura_hr_claim_paid_after_approval;
alter table public.aura_hr_timesheets      drop constraint if exists aura_hr_timesheet_rejected_complete;
alter table public.aura_hr_timesheets      drop constraint if exists aura_hr_timesheet_submitted_complete;
alter table public.aura_hr_staff_advances  drop constraint if exists aura_hr_advance_rejected_complete;
alter table public.aura_hr_expense_claims  drop constraint if exists aura_hr_claim_rejected_complete;
alter table public.aura_hr_expense_claims  drop constraint if exists aura_hr_claim_submitted_complete;
alter table public.aura_hr_timesheets      drop column if exists rejected_at;
alter table public.aura_hr_timesheets      drop column if exists rejected_by;
alter table public.aura_hr_timesheets      drop column if exists submitted_at;
alter table public.aura_hr_timesheets      drop column if exists submitted_by;
alter table public.aura_hr_staff_advances  drop column if exists disbursed_by;
alter table public.aura_hr_staff_advances  drop column if exists rejected_at;
alter table public.aura_hr_staff_advances  drop column if exists rejected_by;
alter table public.aura_hr_expense_claims  drop column if exists reimbursed_by;
alter table public.aura_hr_expense_claims  drop column if exists rejected_at;
alter table public.aura_hr_expense_claims  drop column if exists rejected_by;
alter table public.aura_hr_expense_claims  drop column if exists submitted_at;
alter table public.aura_hr_expense_claims  drop column if exists submitted_by;

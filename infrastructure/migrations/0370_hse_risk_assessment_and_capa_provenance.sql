-- ============================================================
-- AURA OS — migration 0370: the document that authorises hazardous work says who approved it
--                           (SEC-01 stage 3, wave B)
-- ------------------------------------------------------------
-- A PERMIT TO WORK cannot be approved until its RISK ASSESSMENT is approved. That gate is real and
-- already enforced:
--
--   "a permit can only be approved once its risk assessment is approved"
--
-- and the permit itself is a well-built record: it holds `requested_by` separately from `created_by`
-- precisely so segregation of duties is checkable, and the service refuses the requester their own
-- approval. Measured against the running API, that refusal fires: 409, "a permit can only be
-- approved by someone other than the requester".
--
-- THE DOCUMENT THE GATE DEPENDS ON HAS NONE OF THAT. `approveRiskAssessment(ra)` takes no actor, no
-- permission is asserted, nothing is recorded, and the same person who wrote the assessment approves
-- it. Measured, as one HSE officer:
--
--   201  POST hse/risk-assessments        status=draft   createdBy=u-e2e-hse
--   200  PUT  hse/risk-assessments/:id/approve   status=approved   approvedBy=(NOT RECORDED)
--
-- So the permit's careful two-person rule rests on an authorisation nobody signed. The strength of a
-- chain of controls is the weakest link in it, and this was the weakest by a distance.
--
-- A CAPA — the corrective action an incident produces — keeps `completed_at` and no `completed_by`.
-- The action that closes out a safety finding is performed by nobody.
-- ============================================================

alter table public.aura_hse_risk_assessments
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz;

alter table public.aura_hse_capas
  add column if not exists completed_by text;

comment on column public.aura_hse_risk_assessments.approved_by is
  'Who approved the assessment. A permit to work cannot be approved without an approved one, so this is the signature the whole permit gate rests on — and it did not exist.';
comment on column public.aura_hse_capas.completed_by is
  'Who completed the corrective action. The row kept a timestamp and no actor.';

-- INVARIANT — the approval provenance is all-or-nothing, and an APPROVED assessment has it.
-- Historical rows are exempt through the `approved_at is null` branch: they were approved before the
-- column existed, and inferring an approver from `created_by` would manufacture the very
-- self-approval this migration exists to stop recording silently.
alter table public.aura_hse_risk_assessments
  drop constraint if exists aura_hse_ra_approved_complete;
alter table public.aura_hse_risk_assessments
  add constraint aura_hse_ra_approved_complete check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  );

-- INVARIANT — THE ASSESSOR DOES NOT APPROVE THEIR OWN ASSESSMENT. Both columns are text user ids on
-- this table, so unlike the HR claim (0368) this comparison is between two of the same kind of thing
-- and the constraint genuinely binds.
alter table public.aura_hse_risk_assessments
  drop constraint if exists aura_hse_ra_self_approval;
alter table public.aura_hse_risk_assessments
  add constraint aura_hse_ra_self_approval check (
    approved_by is null or created_by is null or approved_by <> created_by
  );

-- INVARIANT — a completed CAPA says who completed it and when, or neither.
alter table public.aura_hse_capas
  drop constraint if exists aura_hse_capa_completed_complete;
alter table public.aura_hse_capas
  add constraint aura_hse_capa_completed_complete check (
    (completed_by is null and completed_at is null)
    or (completed_by is not null and completed_at is not null)
  );

create index if not exists idx_aura_hse_ra_approved
  on public.aura_hse_risk_assessments (tenant_id, approved_at);

-- @DOWN
drop index if exists idx_aura_hse_ra_approved;
alter table public.aura_hse_capas            drop constraint if exists aura_hse_capa_completed_complete;
alter table public.aura_hse_risk_assessments drop constraint if exists aura_hse_ra_self_approval;
alter table public.aura_hse_risk_assessments drop constraint if exists aura_hse_ra_approved_complete;
alter table public.aura_hse_capas            drop column if exists completed_by;
alter table public.aura_hse_risk_assessments drop column if exists approved_at;
alter table public.aura_hse_risk_assessments drop column if exists approved_by;

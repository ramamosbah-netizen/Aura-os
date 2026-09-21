-- ============================================================
-- AURA OS — migration 0374: a claim for extra time says who wrote it, and a cancelled project says why
--                           (SEC-01 stage 3, wave E — projects)
-- ------------------------------------------------------------
-- ONE PERMISSION GOVERNED EVERY DELAY AND EOT ACT IN THIS MODULE, AND IT WAS THE WRONG ONE.
-- `assertProjectAccess` in delay-eot.service.ts asserted `projects.project.update` for creating a
-- delay event, assessing it, raising an EOT claim, submitting that claim and DECIDING it. Measured
-- against the shipped role catalogue:
--
--   r-commercial-manager   NAMES projects.eot-claim.*   holds projects.project.update? NO
--   r-planning-engineer    NAMES projects.delay.*       holds projects.project.update? NO
--   r-pm                   holds projects.*             so it does all of them
--
-- So the role whose job an EOT claim IS could not touch one (403, measured against the running
-- API), the Planning Engineer could not assess the delay behind it, and the one role that could do
-- both submitted the claim and decided it. This is the shape wave B removed from the permit to
-- work, where ASKING for a permit required the authority to GRANT one; here the same helper made
-- raising a contractual time claim require the authority to determine it.
--
-- AND THE CLAIM RECORDED NOBODY WHO MADE IT. The table has `submitted_at`, `decided_at` and
-- `decided_by` — and NO `created_by` AND NO `submitted_by`. An extension-of-time claim is a formal
-- contractual position that moves the completion date and carries money with it; this one was
-- written by nobody and submitted by nobody. Where an actor was recorded, the controller wrote
-- `decidedBy: ctx.actorId ?? 'system'`, so an unauthenticated determination was attributed to a
-- principal named "system" that does not exist in any roster — the same fabrication wave C removed
-- when an approval was allowed to stand in for the review it never had.
--
-- CANCELLING A PROJECT IS THE COUNTER-EXAMPLE, and worth saying so plainly: it is well built. The
-- service refuses to proceed without an actor AND without a reason ("an empty string in the audit
-- trail is worse than no field, because it looks like an answer"), and it evaluates a real lifecycle
-- transition first. Both facts go into the event payload. What they do not go into is the PROJECT
-- ROW, which afterwards reads `status = 'cancelled'` and nothing else — so anyone looking at the
-- project, rather than replaying the event store, sees that it was abandoned and cannot see by whom
-- or why. The audit trail exists; the record does not carry it.
-- ============================================================

alter table public.aura_projects_eot_claims
  add column if not exists created_by   text,
  add column if not exists submitted_by text;

comment on column public.aura_projects_eot_claims.submitted_by is
  'Who submitted the claim to the client. The table recorded `submitted_at` with nobody beside it, and had no author column at all.';

alter table public.aura_projects_projects
  add column if not exists cancelled_by        text,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancellation_reason text;

comment on column public.aura_projects_projects.cancellation_reason is
  'WHY the project was abandoned, on the record rather than only in the event payload. The service already required both this and an actor; the row kept neither.';

-- INVARIANT — the decision provenance is all-or-nothing, and so is the cancellation's.
-- The `is not null` tests are written out rather than leaning on `btrim(x) <> ''`, which evaluates
-- to NULL when x is NULL: `FALSE OR NULL` is NULL and a CHECK PASSES on NULL. That hole shipped
-- once, in 0362, and was caught only by its own test.
alter table public.aura_projects_eot_claims
  drop constraint if exists aura_projects_eot_decided_complete;
alter table public.aura_projects_eot_claims
  add constraint aura_projects_eot_decided_complete check (
    (decided_by is null and decided_at is null)
    or (decided_by is not null and decided_at is not null)
  );

alter table public.aura_projects_projects
  drop constraint if exists aura_projects_cancelled_complete;
alter table public.aura_projects_projects
  add constraint aura_projects_cancelled_complete check (
    (cancelled_by is null and cancelled_at is null and cancellation_reason is null)
    or (
      cancelled_by is not null
      and cancelled_at is not null
      and cancellation_reason is not null
      and btrim(cancellation_reason) <> ''
    )
  );

-- INVARIANT — the cancellation metadata and the status cannot disagree.
alter table public.aura_projects_projects
  drop constraint if exists aura_projects_cancelled_status;
alter table public.aura_projects_projects
  add constraint aura_projects_cancelled_status check (
    cancelled_at is null or status = 'cancelled'
  );

-- INVARIANT — THE PERSON WHO SUBMITTED A TIME CLAIM DOES NOT DETERMINE IT.
-- A claim goes OUT to the client and a determination comes back; one account doing both is not an
-- exchange, it is a self-assessment with a status field on it.
--
-- `NOT VALID`, and for the usual reason: rows on disk predate `submitted_by` entirely, so none of
-- them can satisfy a comparison against it, and the probe that measured this defect decided its own
-- claim and is part of that history. The rule binds on every insert and update from here on while
-- the existing rows stay readable and countable, which is what a finding needs to remain evidence.
-- Once the affected claims have been determined again by a second person:
--
--   ALTER TABLE public.aura_projects_eot_claims VALIDATE CONSTRAINT aura_projects_eot_submit_not_decide;
--
-- and it will refuse until that is true, which is the right moment to be told.
alter table public.aura_projects_eot_claims
  drop constraint if exists aura_projects_eot_submit_not_decide;
alter table public.aura_projects_eot_claims
  add constraint aura_projects_eot_submit_not_decide check (
    decided_by is null or submitted_by is null or decided_by <> submitted_by
  ) not valid;

-- INVARIANT — a determined claim was submitted first. Deciding a draft would mean answering a
-- claim the client was never sent.
alter table public.aura_projects_eot_claims
  drop constraint if exists aura_projects_eot_decide_after_submit;
alter table public.aura_projects_eot_claims
  add constraint aura_projects_eot_decide_after_submit check (
    decided_at is null or submitted_at is not null
  ) not valid;

create index if not exists idx_aura_projects_cancelled
  on public.aura_projects_projects (tenant_id, cancelled_at);

-- @DOWN
drop index if exists idx_aura_projects_cancelled;
alter table public.aura_projects_eot_claims drop constraint if exists aura_projects_eot_decide_after_submit;
alter table public.aura_projects_eot_claims drop constraint if exists aura_projects_eot_submit_not_decide;
alter table public.aura_projects_projects   drop constraint if exists aura_projects_cancelled_status;
alter table public.aura_projects_projects   drop constraint if exists aura_projects_cancelled_complete;
alter table public.aura_projects_eot_claims drop constraint if exists aura_projects_eot_decided_complete;
alter table public.aura_projects_projects   drop column if exists cancellation_reason;
alter table public.aura_projects_projects   drop column if exists cancelled_at;
alter table public.aura_projects_projects   drop column if exists cancelled_by;
alter table public.aura_projects_eot_claims drop column if exists submitted_by;
alter table public.aura_projects_eot_claims drop column if exists created_by;

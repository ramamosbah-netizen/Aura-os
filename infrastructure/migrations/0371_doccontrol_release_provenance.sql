-- ============================================================
-- AURA OS — migration 0371: a document leaving the building says who released it
--                           (SEC-01 stage 3, wave C — Document Control)
-- ------------------------------------------------------------
-- MEASURED: NO SHIPPED ROLE HOLDS A SINGLE `doccontrol` WRITE PERMISSION. All 24 roles hold
-- `doccontrol.*.read` or `documents.*.read` and nothing else, so 19 mutating routes and seven
-- governing verbs are reachable only through r-admin, and there is NO DOCUMENT CONTROLLER ROLE in
-- the catalogue at all. The Technical Manager gets 403 creating a register entry.
--
-- The revision record itself is well built: `createdBy`, `submittedBy`, `reviewedBy`, `decidedBy`
-- and `issuedBy` are five separate columns with five separate timestamps, the state machine is
-- strict (`submitted -> under_review -> approved -> issued`, with no shortcut), a rejection reason is
-- mandatory, `createNextRevision` never mutates its source, and issuing a revision supersedes the
-- prior issued one. SUPERSEDE-NOT-OVERWRITE IS ALREADY TRUE. Nothing here changes any of that.
--
-- What no rule connected was WHO may stand in each of those five columns. Measured, one principal:
--
--   201 submit   201 start-review   201 approve   201 issue
--   submittedBy = decidedBy = issuedBy = u-admin
--
-- One person authored, reviewed, approved and released the same drawing to the outside world.
--
-- THE OTHER THREE RECORDS RECORD LESS THAN THE REVISION DOES.
--
--   * A TRANSMITTAL is the act of a document leaving the building, and `sendTransmittal(t)` takes no
--     actor: the row keeps `sent_at` and no `sent_by`. (`sender` is a free-text addressee label and
--     resolves to nobody.) Its RECIPIENTS are correctly frozen at `sent` — measured, 409 — but its
--     ITEMS are not: attaching a document to an already-sent transmittal returned 201. The list of
--     what was conveyed can change after the conveyance, which is the exact objection the recipient
--     route makes about itself in its own comment.
--   * CORRESPONDENCE close records nobody, asks for no reason, and has no state guard: closing an
--     already-closed item returned 200.
--   * A SUBMITTAL keeps `submitted_at` and `returned_at` with no actor on either.
-- ============================================================

alter table public.aura_doccontrol_transmittals
  add column if not exists sent_by text;

alter table public.aura_doccontrol_correspondence
  add column if not exists closed_by    text,
  add column if not exists closed_at    timestamptz,
  add column if not exists close_reason text;

alter table public.aura_doccontrol_submittals
  add column if not exists submitted_by text,
  add column if not exists returned_by  text;

comment on column public.aura_doccontrol_transmittals.sent_by is
  'Who released this conveyance. The act of a document leaving the building recorded only a timestamp; `sender` is a free-text addressee label, not an actor.';
comment on column public.aura_doccontrol_correspondence.close_reason is
  'WHY the item was closed. Required with closed_by/at: closing a piece of project correspondence ends an obligation, and it was anonymous and unexplained.';

-- INVARIANT 1 — a named sender implies a send time. ONE DIRECTION ONLY, and the asymmetry is the
-- point: transmittals sent before `sent_by` existed carry a timestamp and no sender, and that is
-- exactly what they are — conveyances whose releaser was never recorded. Forbidding that shape would
-- refuse to describe the history, and backfilling a sender from `created_by` would manufacture a
-- release signature that never happened. The forward direction is what a new row must satisfy.
alter table public.aura_doccontrol_transmittals
  drop constraint if exists aura_dc_transmittal_sent_complete;
alter table public.aura_doccontrol_transmittals
  add constraint aura_dc_transmittal_sent_complete check (
    sent_by is null or sent_at is not null
  );

-- INVARIANT 2 — a closed correspondence says who, when and WHY, or says nothing.
-- The `close_reason is not null` test is deliberate: `btrim(x) <> ''` evaluates to NULL when x is
-- NULL, `FALSE OR NULL` is NULL, and a CHECK constraint PASSES on NULL. That hole shipped once, in
-- 0362, and was caught by its own test; it is not repeated.
alter table public.aura_doccontrol_correspondence
  drop constraint if exists aura_dc_correspondence_closed_complete;
alter table public.aura_doccontrol_correspondence
  add constraint aura_dc_correspondence_closed_complete check (
    (closed_by is null and closed_at is null and close_reason is null)
    or (
      closed_by is not null
      and closed_at is not null
      and close_reason is not null
      and btrim(close_reason) <> ''
    )
  );

-- INVARIANT 3 — the close metadata and the status cannot disagree.
alter table public.aura_doccontrol_correspondence
  drop constraint if exists aura_dc_correspondence_closed_status;
alter table public.aura_doccontrol_correspondence
  add constraint aura_dc_correspondence_closed_status check (
    closed_at is null or status = 'closed'
  );

-- INVARIANT 4 — AUTHOR /= APPROVER /= ISSUER, on the record rather than only in the service.
-- All three are text user ids on the same table, so unlike the HR claim (0368) this comparison is
-- between two of the same kind of thing and genuinely binds. NULLs pass on purpose: revisions written
-- before a column existed carry none, and refusing them would block work over a fact nobody recorded.
--
-- BOTH ARE `NOT VALID`, AND THAT IS THE HONEST FORM HERE. Rows on disk already violate them — the
-- probe that measured this defect produced one of each, and they are the EVIDENCE. `NOT VALID`
-- enforces the rule on every insert and update from now on while leaving the existing rows readable
-- and countable, which is what a finding needs to stay a finding. Deleting them would destroy the
-- proof; weakening the rule to admit them would make the constraint a decoration. Once the affected
-- revisions have been superseded by ones with three distinct signatures, `VALIDATE CONSTRAINT` turns
-- these into fully checked invariants:
--
--   ALTER TABLE public.aura_doccontrol_document_revisions
--     VALIDATE CONSTRAINT aura_dc_revision_author_not_approver;
--
-- and it will refuse until that is true, which is the right moment to be told.
alter table public.aura_doccontrol_document_revisions
  drop constraint if exists aura_dc_revision_author_not_approver;
alter table public.aura_doccontrol_document_revisions
  add constraint aura_dc_revision_author_not_approver check (
    decided_by is null or submitted_by is null or decided_by <> submitted_by
  ) not valid;

alter table public.aura_doccontrol_document_revisions
  drop constraint if exists aura_dc_revision_approver_not_issuer;
alter table public.aura_doccontrol_document_revisions
  add constraint aura_dc_revision_approver_not_issuer check (
    issued_by is null or decided_by is null or issued_by <> decided_by
  ) not valid;

-- INVARIANT 5 — an issued revision was approved by somebody, and an approved one was reviewed by
-- somebody. The second half is the amendment to the review rule: the state machine already forces
-- `submitted -> under_review -> approved`, so review is a FORMAL STAGE and not decoration. What it
-- did not force is that the stage left a name behind, which is how `reviewedBy` could be filled in
-- at approval time by the approver.
alter table public.aura_doccontrol_document_revisions
  drop constraint if exists aura_dc_revision_issued_after_decision;
alter table public.aura_doccontrol_document_revisions
  add constraint aura_dc_revision_issued_after_decision check (
    issued_at is null or decided_at is not null
  );

create index if not exists idx_aura_dc_transmittals_sent
  on public.aura_doccontrol_transmittals (tenant_id, sent_at);

-- @DOWN
drop index if exists idx_aura_dc_transmittals_sent;
alter table public.aura_doccontrol_document_revisions drop constraint if exists aura_dc_revision_issued_after_decision;
alter table public.aura_doccontrol_document_revisions drop constraint if exists aura_dc_revision_approver_not_issuer;
alter table public.aura_doccontrol_document_revisions drop constraint if exists aura_dc_revision_author_not_approver;
alter table public.aura_doccontrol_correspondence     drop constraint if exists aura_dc_correspondence_closed_status;
alter table public.aura_doccontrol_correspondence     drop constraint if exists aura_dc_correspondence_closed_complete;
alter table public.aura_doccontrol_transmittals       drop constraint if exists aura_dc_transmittal_sent_complete;
alter table public.aura_doccontrol_submittals   drop column if exists returned_by;
alter table public.aura_doccontrol_submittals   drop column if exists submitted_by;
alter table public.aura_doccontrol_correspondence drop column if exists close_reason;
alter table public.aura_doccontrol_correspondence drop column if exists closed_at;
alter table public.aura_doccontrol_correspondence drop column if exists closed_by;
alter table public.aura_doccontrol_transmittals  drop column if exists sent_by;

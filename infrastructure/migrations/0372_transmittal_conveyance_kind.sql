-- ============================================================
-- AURA OS — migration 0372: an internal handoff is not a conveyance to the client
--                           (SEC-01 stage 3, wave C — the engineering back door)
-- ------------------------------------------------------------
-- Wave C gave document control a release authority: `doccontrol.revision.issue` and
-- `doccontrol.transmittal.send` sit with the Document Controller, the approver may not issue what
-- they approved, and a sent transmittal is frozen. THERE WAS A SECOND ROUTE TO A SENT TRANSMITTAL
-- THAT OBEYED NONE OF IT.
--
-- `POST engineering/drawings/:id/transmit` emits `engineering.drawing.transmitted`, and its reactor
-- (apps/api/src/events/drawing-transmittal-subscriber.ts) CREATES A DOCCONTROL TRANSMITTAL AND SENDS
-- IT. Measured on the record it produced:
--
--   created_by = (none)      sent_by = (none)      status = sent
--
-- The reactor passed `actorId: null` to both calls, commented at the call site as "system-initiated
-- conveyance: no createdBy -> no cross-module permission coupling". Both service methods skip their
-- permission check when no actor is supplied, so DECLINING TO NAME THE ACTOR WAS THE MECHANISM THAT
-- SKIPPED THE GUARD. An engineer holding not one document-control permission produced a sent
-- conveyance signed by nobody, and the register held it in the same table, with the same status, as
-- a transmittal the Document Controller had released to the client. Nothing distinguished them.
--
-- THE ACT ITSELF IS LEGITIMATE and stays where it is. It is an INTERNAL HANDOFF: the recipients are
-- platform user ids — the Site Engineer, Project Engineer and Buyer who take an `engineering_release`
-- responsibility for the drawing — and nothing leaves the business through it. What was wrong was
-- that the record did not say so, and that it was unsigned.
--
--   * `kind` marks which it is. It is NOT reachable from any request body: `internal_release` can
--     only be obtained by being the engineering reactor, and everything created through document
--     control's own route is `external`. The engineering path therefore cannot manufacture an
--     external conveyance, because it cannot ask for one.
--   * The engineer is now recorded as creator and releaser. `engineering.drawing.transmit` was
--     already asserted upstream on the drawing, so naming them grants nothing — it only stops the
--     record pretending the release happened by itself.
-- ============================================================

alter table public.aura_doccontrol_transmittals
  add column if not exists kind text;

comment on column public.aura_doccontrol_transmittals.kind is
  'internal_release = the engineering handoff produced it; external = document control released it outside the business. NULL = written before the distinction existed, and read as external (the safer of the two mistakes).';

-- Only the two known kinds, and NULL for history. A typo elsewhere in the system would otherwise
-- create a third kind that `isExternalConveyance` silently treats as external.
alter table public.aura_doccontrol_transmittals
  drop constraint if exists aura_dc_transmittal_kind;
alter table public.aura_doccontrol_transmittals
  add constraint aura_dc_transmittal_kind check (
    kind is null or kind in ('internal_release', 'external')
  );

-- INVARIANT — A SENT EXTERNAL CONVEYANCE SAYS WHO RELEASED IT.
--
-- `NOT VALID`, and for the usual reason: every transmittal the engineering reactor has already sent
-- violates it, and those rows ARE the finding. Enforcing forward while leaving them readable is what
-- keeps them countable as evidence; deleting them would destroy the proof, and backfilling a releaser
-- would manufacture the signature this migration exists because nobody gave.
--
-- Rows with `kind is null` are exempt: they predate the distinction, and demanding a releaser from a
-- record written before the column existed refuses to describe history rather than correcting it.
-- Once the affected conveyances have aged out:
--
--   ALTER TABLE public.aura_doccontrol_transmittals
--     VALIDATE CONSTRAINT aura_dc_transmittal_external_send_signed;
--
-- and it will refuse until that is true, which is the right moment to be told.
alter table public.aura_doccontrol_transmittals
  drop constraint if exists aura_dc_transmittal_external_send_signed;
alter table public.aura_doccontrol_transmittals
  add constraint aura_dc_transmittal_external_send_signed check (
    kind is distinct from 'external' or sent_at is null or sent_by is not null
  ) not valid;

create index if not exists idx_aura_dc_transmittals_kind
  on public.aura_doccontrol_transmittals (tenant_id, kind);

-- @DOWN
drop index if exists idx_aura_dc_transmittals_kind;
alter table public.aura_doccontrol_transmittals drop constraint if exists aura_dc_transmittal_external_send_signed;
alter table public.aura_doccontrol_transmittals drop constraint if exists aura_dc_transmittal_kind;
alter table public.aura_doccontrol_transmittals drop column if exists kind;

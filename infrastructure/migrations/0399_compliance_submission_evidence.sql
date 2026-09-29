-- 0399 — A SUBMISSION TO AN AUTHORITY NEVER EXISTS WITHOUT EVIDENCE (SEC-01 D-09, owner 2026-09-29).
--
-- A submission recorded a date, a reference and a fee — and nothing that proved anything was sent.
-- Now every submission says HOW it was made, and carries what proves it:
--
--   controlled_package  the controlled documents went out as a doccontrol transmittal — the transmittal
--                       is required (the service also checks it exists and was SENT)
--   authority_portal    the method produces no package (an authority's online portal) — the portal's
--                       submission reference AND a stored evidence document (the portal receipt) are required
--
-- NOT VALID, deliberately: the check binds every row written from now on, and does not reach back to
-- submissions recorded before the rule existed. Those carry no method, and nothing is invented for them
-- — a back-filled method would be a record claiming evidence nobody kept.
alter table public.aura_compliance_submissions
  add column if not exists method               text,
  add column if not exists transmittal_id       uuid,
  add column if not exists evidence_document_id uuid;

alter table public.aura_compliance_submissions
  drop constraint if exists chk_aura_compliance_submission_evidence;
alter table public.aura_compliance_submissions
  add constraint chk_aura_compliance_submission_evidence check (
    method is not null
    and (
      (method = 'controlled_package' and transmittal_id is not null and evidence_document_id is null)
      or (method = 'authority_portal' and evidence_document_id is not null and transmittal_id is null
          and reference is not null and length(btrim(reference)) > 0)
    )
  ) not valid;

-- @DOWN
alter table public.aura_compliance_submissions drop constraint if exists chk_aura_compliance_submission_evidence;
alter table public.aura_compliance_submissions
  drop column if exists evidence_document_id,
  drop column if exists transmittal_id,
  drop column if exists method;

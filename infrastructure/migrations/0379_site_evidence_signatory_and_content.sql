-- ============================================================
-- AURA OS — migration 0379: a site signature names its signer and the content it covers
--                           (XOP-12 — site / daily report)
-- ------------------------------------------------------------
-- The daily report has stored a real signature since SIT-04: uploaded, hashed, reloaded, and
-- downloadable by the people who review the day. What it could not say was WHOSE it was, or WHAT
-- it was given for.
--
-- ------------------------------------------------------------
-- 1. WHO SIGNED IS NOT WHO UPLOADED.
--
-- `captured_by` falls back to `created_by` — the account that sent the file. The form labels the
-- pad "Supervisor Sign-off" and is filled in at the tablet by whoever is holding it, so the
-- printable report rendered "Signed by <the site engineer>" over a signature the FOREMAN gave.
-- The controlled document credited the recorder with somebody else's act.
--
-- `signed_by` is a LABEL and not a user id, deliberately: a foreman or a consultant's witness
-- signing a site diary need not hold an AURA account. It sits beside `captured_by` exactly as a
-- handover's `client_representative` sits beside `accepted_by`, and the two are never merged.
--
-- ------------------------------------------------------------
-- 2. A SIGNATURE COVERS CONTENT, NOT A ROW ID.
--
-- Binding it to `daily_report_id` alone binds it to the record and not to what the record said.
-- `rejected` returns a report to `draft`; the narrative and the counts can then be edited; and the
-- signature given for the earlier text stayed attached and kept printing on the controlled sheet
-- as though the supervisor had agreed to the new one.
--
-- `signed_content_hash` is sha256 over the four fields the form shows beside the pad and the sheet
-- prints — date, work description, manpower, equipment (see `dailyReportContentHash`). Computed by
-- the server from the PERSISTED report at the moment of upload, never supplied by the caller, for
-- the same reason the file checksum is not.
--
-- NOT BACKFILLED. A signature taken before this column existed is a real signature, and computing
-- a hash for it now would assert that somebody signed today's text when nobody checked. Null reads
-- as `unverifiable`, which every surface must render differently from both `current` and
-- `superseded`.
--
-- No CHECK constraint ties the two to `category = 'signature'`: the domain refuses a signature with
-- no signatory and a non-signature that names one, and putting the same rule in two places is how
-- they drift. The column comment records the rule the domain enforces.
-- ============================================================

alter table public.aura_site_report_evidence
  add column if not exists signed_by            text,
  add column if not exists signed_content_hash  text;

comment on column public.aura_site_report_evidence.signed_by is
  'The person who SIGNED, as a label — not a user id, because a foreman or a witness need not hold an AURA account. Never derived from captured_by/created_by, which is who uploaded it. Required by the domain when category = ''signature'' and refused on any other category.';

comment on column public.aura_site_report_evidence.signed_content_hash is
  'sha256 of the report content this signature was given for (date, work description, manpower, equipment). Computed server-side from the persisted report, never accepted from the caller. Null means the signature predates this column and reads as unverifiable, never as a mismatch.';

-- @DOWN
alter table public.aura_site_report_evidence
  drop column if exists signed_content_hash,
  drop column if exists signed_by;

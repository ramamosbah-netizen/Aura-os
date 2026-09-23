-- ============================================================
-- AURA OS — migration 0384: whose witness, and what the test produced
--                           (TC-06 / TC-07 — commissioning)
-- ------------------------------------------------------------
-- 1. WITNESS IDENTITY IS NOT WITNESS AUTHORITY.
--
-- TC-06 asks that "witness identity AND AUTHORITY persist on real system test/certificate". 0381
-- gave the sign-off a signatory: a name, and which side of the sign-off it belongs to
-- (`commissioning_engineer` or `witness`). That answers WHO and leaves WHOSE unanswered.
--
-- On a UAE ELV project the difference is not decorative. A consultant's witness, the client's own
-- representative and an authority inspector (Civil Defence, SIRA) are three different standings,
-- and a certificate that records "witnessed by R. Consultant" without saying which of them signed
-- is a certificate that cannot be relied on later. The party column says which SIDE signed; this
-- says on whose behalf.
--
-- Required by the domain for a witness and defaulted to `contractor` for the engineer signing off,
-- because the engineer signs for the contractor by definition and asking would be ceremony.
--
-- ------------------------------------------------------------
-- 2. COMMISSIONING HAD NO DOOR FOR A FILE.
--
-- TC-07 is "Witness signature AND ATTACHMENTS". The signature exists since 0381. The attachments
-- never did: every multipart route in AURA is in CRM, Tendering, DocControl, Site and — since
-- 0382 — Quality. Commissioning has none, so a witnessed test could carry no instrument printout,
-- no photograph of the installed device, no calibration certificate. The evidence a test actually
-- produces had nowhere to go.
--
-- A SEPARATE TABLE FROM THE SIGN-OFF EVIDENCE, deliberately. A signature belongs to a PARTY and
-- carries a method, a signatory and the result it covers; an attachment belongs to the RECORD and
-- carries none of those. Folding them together would give every attachment a nullable party and
-- every signature a nullable description, and a surface reading either would have to guess which
-- kind it had.
--
-- Same shape as site and quality evidence, so the three read alike: what it IS, who RECORDED it,
-- and the checksum the server computed over the bytes it received.
-- ============================================================

alter table public.aura_commissioning_signoff_evidence
  add column if not exists signatory_authority text;

comment on column public.aura_commissioning_signoff_evidence.signatory_authority is
  'On whose behalf this party signed: contractor, consultant, client or authority. The `party` column says which SIDE signed; this says whose standing it was. Required by the domain for a witness — a consultant''s witness, a client representative and an authority inspector are three different things on a certificate.';

-- Backfilled only where it is a fact rather than a guess: the commissioning engineer signs for the
-- contractor by definition. A witness row written before this column existed is left NULL, because
-- nobody recorded whose witness they were and inventing it is what this migration exists to stop.
update public.aura_commissioning_signoff_evidence
   set signatory_authority = 'contractor'
 where party = 'commissioning_engineer'
   and signatory_authority is null;

create table if not exists public.aura_commissioning_attachments (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,
  commissioning_id uuid        not null,
  project_id       text        not null,
  file_id          text        not null,
  -- What the file IS, so no surface has to guess it from a free-text description.
  category         text        not null default 'photo',   -- photo | instrument | certificate | other
  description      text,
  -- WHO RECORDED IT. Never presented as a signatory: an attachment has none.
  captured_by      text,
  -- Tamper-evidence over the stored bytes, computed by the server and never accepted from the caller.
  hash             text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_cx_attachments_record
  on public.aura_commissioning_attachments (tenant_id, commissioning_id);

alter table public.aura_commissioning_attachments enable row level security;
alter table public.aura_commissioning_attachments force row level security;
drop policy if exists tenant_isolation on public.aura_commissioning_attachments;
create policy tenant_isolation on public.aura_commissioning_attachments
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

comment on table public.aura_commissioning_attachments is
  'What a witnessed test produced: instrument printouts, photographs, calibration certificates. Append-only. Sealed as committed evidence once the record is commissioned, because they are part of what the witness signed against.';

-- @DOWN
drop table if exists public.aura_commissioning_attachments;
alter table public.aura_commissioning_signoff_evidence drop column if exists signatory_authority;

-- ============================================================
-- 0403 — A COMPANY CARRIES ITS OWN DOCUMENT IDENTITY (F-01)
--
-- What a company prints on its paper was half in its record and half in the tenant's settings:
-- name, TRN and currency on aura_companies, but the legal name, registered address, phone, email
-- and website only as tenant-wide `company.*` settings. A tenant with two companies could therefore
-- give each its own name and TRN, and then print the SAME legal name and address on both — one of
-- them another company's. Thirteen print pages did not ask at all: they printed a typed-in
-- "AURA OS Contracting LLC, Dubai, TRN 100000000000003".
--
-- The company record now holds the rest of its identity. The tenant's organisation profile stays
-- what it is — the identity of a tenant with one company — and the resolver
-- (apps/api/src/common/document-identity.ts) no longer lets it speak for one company among several.
--
-- Nullable, no backfill: a company whose legal name or address nobody recorded has none, and an
-- invented one would be a letterhead nobody approved.
-- ============================================================

alter table public.aura_companies
  add column if not exists legal_name text,
  add column if not exists address    text,
  add column if not exists phone      text,
  add column if not exists email      text,
  add column if not exists website    text;

-- @DOWN
alter table public.aura_companies
  drop column if exists website,
  drop column if exists email,
  drop column if exists phone,
  drop column if exists address,
  drop column if exists legal_name;

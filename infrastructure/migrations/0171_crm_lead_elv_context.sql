-- ============================================================
-- AURA OS — migration 0171: ELV commercial context on the Lead (G4)
-- ------------------------------------------------------------
-- A lead had identity (who called), ownership + SLA (0156) and a qualification assessment (0170),
-- but nothing describing the JOB. For a UAE ELV contractor that is the difference between a CRM
-- record and a commercial lead: you cannot route an inquiry to the right estimator, judge its fit,
-- or see that two inquiries are the same project arriving via a consultant and a main contractor.
--
--   requirement        — what they asked for, in their words
--   systems            — jsonb array of canonical ELV system codes (cctv, access_control, …).
--                        A list, not free text: it is the routing/matching key, and "CCTV" typed
--                        six ways cannot be grouped or reported on.
--   sector             — market segment (makes win-rate by sector answerable)
--   project_name /     — WHICH job and WHERE
--   project_location
--   consultant /       — who specifies, and who holds the main contract. Free TEXT on purpose:
--   main_contractor      at lead stage you have a name before a relationship, and forcing an
--                        account link would either block capture or spawn junk accounts. G6
--                        (party types + relationship graph) resolves these names into real links.
--   estimated_value    — rough size at lead stage; an ESTIMATE, not a committed opportunity value
--   project_stage      — design / tender / construction / fit_out / … Timing readiness is not a
--                        date: an inquiry at design stage is real but a year out.
--   expected_timeline  — when they expect to need it, in their words ("Q3", "after Ramadan").
--                        Real inquiries rarely carry a date; a date column would fabricate
--                        precision nobody has.
--
-- These feed G3 directly — `fit`, `timingReadiness` and `commercialPotential` were being rated
-- without them. Nothing computed is stored: contextCompleteness() is derived on read.
--
-- All additive + nullable — every existing lead reads as "context not captured", which is the
-- honest description of a lead recorded before this existed.
-- ============================================================

alter table public.aura_crm_leads
  add column if not exists requirement       text,
  add column if not exists systems           jsonb,
  add column if not exists sector            text,
  add column if not exists project_name      text,
  add column if not exists project_location  text,
  add column if not exists consultant        text,
  add column if not exists main_contractor   text,
  add column if not exists estimated_value   numeric(14,2),
  add column if not exists project_stage     text,
  add column if not exists expected_timeline text;

-- Sector and project stage are the two axes leads get sliced by (win-rate by sector, pipeline by
-- project stage), and both are low-cardinality — worth an index, tenant-scoped like every other.
create index if not exists idx_crm_leads_sector on public.aura_crm_leads (tenant_id, sector);

-- @DOWN
drop index if exists idx_crm_leads_sector;
alter table public.aura_crm_leads
  drop column if exists requirement,
  drop column if exists systems,
  drop column if exists sector,
  drop column if exists project_name,
  drop column if exists project_location,
  drop column if exists consultant,
  drop column if exists main_contractor,
  drop column if exists estimated_value,
  drop column if exists project_stage,
  drop column if exists expected_timeline;

-- ============================================================
-- AURA OS — migration 0385: an evidenced NCR with a date it was due
--                           (QHS-03 — quality)
-- ------------------------------------------------------------
-- QHS-03 asks for four things the record could not carry: "QA/QC raises an EVIDENCED NCR;
-- responsible owner corrects; INDEPENDENT verifier accepts/rejects; OVERDUE ESCALATION and source
-- work linkage persist."
--
-- Source work linkage already exists — `source_ir_id`/`source_ir_number`, populated when a failed
-- inspection raises one. The other three did not.
--
-- ------------------------------------------------------------
-- 1. AN NCR WITH NOTHING ATTACHED IS AN ASSERTION.
--
-- The screen has shown a "QA / Inspector Sign-off" pad since it existed, bound to React state the
-- submit payload never read — the same defect the daily report, the handover acceptance, the
-- commissioning sign-off and the inspection request all had. And there was no attachment route:
-- a non-conformance could not carry a photograph of the thing that was wrong.
--
-- Evidence here has a STAGE, which is what makes one table right where the inspection needed only
-- a flat list. A photograph of the defect and a photograph of the repair are both evidence of the
-- same NCR and they are not interchangeable: closing an NCR on a picture of the original fault
-- would be exactly the confusion this column prevents.
--
-- ------------------------------------------------------------
-- 2. "OVERDUE" NEEDS A DATE TO BE OVERDUE AGAINST.
--
-- Nothing on the record said when the correction was due, so nothing could be late and there was
-- nothing to escalate. `due_at` is nullable: an NCR raised without a date is not overdue, it is
-- undated, and those are different claims.
--
-- Escalation is RECORDED rather than derived on the fly. A row that says "this was escalated, on
-- this date, by this person" survives the due date being changed afterwards; a computed "is it
-- late right now" does not, and an escalation that vanishes when somebody extends the deadline is
-- not an audit trail.
--
-- ------------------------------------------------------------
-- 3. THE VERIFIER IS NOT THE PERSON WHO DID THE WORK.
--
-- Enforced in the domain rather than by a column, like every other separation in this system. The
-- columns that make it checkable — `corrected_by` and `verified_by` — are added here.
-- ============================================================

alter table public.aura_quality_ncrs
  add column if not exists source_ir_id       text,
  add column if not exists source_ir_number   text,
  add column if not exists action_planned_at  timestamptz,
  add column if not exists corrected_by       text,
  add column if not exists corrected_at       timestamptz,
  add column if not exists verified_by        text,
  add column if not exists verified_at        timestamptz,
  add column if not exists closed_at          timestamptz,
  add column if not exists system             text,
  add column if not exists corrective_action  text,
  -- When the correction is due. NULL is "undated", which is not the same as "not overdue".
  add column if not exists due_at             timestamptz,
  -- Recorded, not derived: an escalation that disappears when somebody extends the deadline is
  -- not an audit trail.
  add column if not exists escalated_at       timestamptz,
  add column if not exists escalated_by       text,
  add column if not exists escalation_reason  text;

comment on column public.aura_quality_ncrs.due_at is
  'When the correction is due. NULL means undated — an NCR nobody put a date on is not overdue, and saying it is would be inventing a fact.';
comment on column public.aura_quality_ncrs.escalated_at is
  'When this NCR was escalated for being overdue. RECORDED rather than derived, so the escalation survives the due date being changed afterwards.';
comment on column public.aura_quality_ncrs.verified_by is
  'The independent verifier. The domain refuses the person who marked it corrected — somebody signing off their own repair is not verification.';

create table if not exists public.aura_quality_ncr_evidence (
  id          uuid        primary key,
  tenant_id   text        not null,
  company_id  text,
  ncr_id      uuid        not null,
  project_id  text        not null,
  file_id     text        not null,
  -- WHICH SIDE of the NCR this evidences. A photograph of the defect and a photograph of the
  -- repair are not interchangeable, and closing an NCR on a picture of the original fault is the
  -- confusion this prevents.
  stage       text        not null default 'raised',   -- raised | corrected
  category    text        not null default 'photo',    -- photo | signature | other
  description text,
  captured_by text,
  hash        text,
  -- WHO SIGNED, for a signature row. A label: a subcontractor's foreman signing off a repair holds
  -- no AURA account. Never derived from captured_by.
  signed_by   text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_quality_ncr_evidence_ncr
  on public.aura_quality_ncr_evidence (tenant_id, ncr_id);

alter table public.aura_quality_ncr_evidence enable row level security;
alter table public.aura_quality_ncr_evidence force row level security;
drop policy if exists tenant_isolation on public.aura_quality_ncr_evidence;
create policy tenant_isolation on public.aura_quality_ncr_evidence
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_quality_ncr_evidence;
alter table public.aura_quality_ncrs
  drop column if exists escalation_reason,
  drop column if exists escalated_by,
  drop column if exists escalated_at,
  drop column if exists due_at;

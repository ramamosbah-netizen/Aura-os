-- ============================================================
-- AURA OS — migration 0229: governed permit-to-work + incident investigation workflow
-- ------------------------------------------------------------
-- Closes the residue of gap G-08: HSE was the last delivery-half module still at CRUD, and it is
-- the one where CRUD is a safety matter rather than a reporting one.
--
-- Permit to work — the record that authorises high-risk work — gains the columns behind three
-- approval gates enforced in HseService.approvePermit:
--   * risk_assessment_id  — a permit may only be approved when it cites an APPROVED assessment
--   * requested_by        — segregation of duties: the requester may not approve their own permit
--   * rejection_reason    — mandatory on reject, so the requester knows what to correct
--
-- Incident gains a real investigation lifecycle (reported → investigating → closed) with a
-- mandatory root cause, and closure is gated on its corrective actions being complete — the same
-- shape of control as the commissioning punch list (0228).
--
-- Additive columns only, on tables owned by the HSE module. Existing rows keep their current
-- status; the new columns are nullable, so nothing in flight is invalidated.
-- ============================================================

alter table public.aura_hse_ptws
  add column if not exists risk_assessment_id uuid,
  add column if not exists requested_by       text,
  add column if not exists requested_at       timestamptz,
  add column if not exists rejection_reason   text;

-- The permit → risk-assessment link is the gate's lookup path.
create index if not exists idx_hse_ptws_risk_assessment
  on public.aura_hse_ptws (tenant_id, risk_assessment_id);

alter table public.aura_hse_incidents
  add column if not exists investigated_by          text,
  add column if not exists investigation_started_at timestamptz,
  add column if not exists root_cause               text,
  add column if not exists closed_by                text,
  add column if not exists closed_at                timestamptz;

-- The incident close gate reads corrective actions by (source_type, source_id); without this the
-- check is a sequential scan on every close.
create index if not exists idx_hse_capas_source
  on public.aura_hse_capas (tenant_id, source_type, source_id);

-- @DOWN
drop index if exists idx_hse_capas_source;

alter table public.aura_hse_incidents
  drop column if exists investigated_by,
  drop column if exists investigation_started_at,
  drop column if exists root_cause,
  drop column if exists closed_by,
  drop column if exists closed_at;

drop index if exists idx_hse_ptws_risk_assessment;

alter table public.aura_hse_ptws
  drop column if exists risk_assessment_id,
  drop column if exists requested_by,
  drop column if exists requested_at,
  drop column if exists rejection_reason;

-- ============================================================
-- AURA OS — migration 0156: CRM Lead execution / SLA fields (Lead OS foundation, S1)
-- ------------------------------------------------------------
-- Gives a lead an execution owner + a measurable first-response SLA + a follow-up
-- projection, so leadAttention() can surface unworked leads under "Needs Attention".
--   assigned_to / assigned_at        — the ownership + the clock the SLA runs against
--   first_responded_at               — the EXPLICIT first-response fact (SLA is only
--                                      measurable because this is recorded)
--   sla_first_response_hours         — per-lead SLA target (null ⇒ platform default)
--   next_activity_due                — PROJECTION/cache of the next follow-up's due date;
--                                      Activity remains the source of truth for the work
-- All additive + nullable — existing leads simply read as unassigned/needing attention.
-- ============================================================

alter table public.aura_crm_leads
  add column if not exists assigned_to              text,
  add column if not exists assigned_at              timestamptz,
  add column if not exists first_responded_at       timestamptz,
  add column if not exists sla_first_response_hours integer,
  add column if not exists next_activity_due        text;

create index if not exists idx_crm_leads_assigned_to
  on public.aura_crm_leads (tenant_id, assigned_to);

-- @DOWN
alter table public.aura_crm_leads
  drop column if exists assigned_to,
  drop column if exists assigned_at,
  drop column if exists first_responded_at,
  drop column if exists sla_first_response_hours,
  drop column if exists next_activity_due;

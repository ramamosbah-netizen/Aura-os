-- ============================================================
-- AURA OS — migration 0175: CRM lifecycle completion (C1 — G8+G9+G10+G11)
-- ------------------------------------------------------------
-- The enum rides-along the vision audit said "can ride along with whichever slice touches them":
--
--   leads.accepted_at      — G9: when the assignee ACKNOWLEDGED the assignment. A lead can be
--                            "assigned" in the system and owned by nobody in reality; this fact
--                            powers the 7th §8 attention reason (ASSIGNMENT_NOT_ACCEPTED).
--   activities.started_at  — G11: when work actually began. A site visit that has STARTED is a
--                            different fact from one on the calendar, and field work spans hours.
--
-- G8's new lead statuses (verified/assigned/qualifying) and G10's activity types (whatsapp,
-- site_visit, …) need NO schema change: both columns are unconstrained text by design, so the
-- vocabulary widens in the domain layer alone. Additive + nullable — every existing row reads
-- honestly as "not captured".
-- ============================================================

alter table public.aura_crm_leads
  add column if not exists accepted_at timestamptz;

alter table public.aura_crm_activities
  add column if not exists started_at timestamptz;

-- @DOWN
alter table public.aura_crm_leads drop column if exists accepted_at;
alter table public.aura_crm_activities drop column if exists started_at;

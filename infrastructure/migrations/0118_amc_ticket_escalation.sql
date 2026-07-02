-- ============================================================
-- AURA OS — migration 0118: AMC ticket SLA escalation tier
-- ------------------------------------------------------------
-- Escalation level bumped by the SLA-breach sweep (0 = never escalated). Drives the
-- amc.ticket.sla_breached event → notifications + escalation path.
-- ============================================================

alter table public.aura_amc_tickets
  add column if not exists escalation_level integer not null default 0;

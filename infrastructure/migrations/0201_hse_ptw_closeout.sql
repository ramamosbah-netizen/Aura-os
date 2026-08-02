-- ============================================================
-- AURA OS — migration 0201: permit-to-work close-out
-- ------------------------------------------------------------
-- A permit to work must be formally CLOSED when the high-risk activity finishes and the area is
-- made safe — the auditable end of the permit. Adds who closed it and when. Additive columns on
-- the existing aura_hse_ptws table (owned by the HSE module).
-- ============================================================

alter table public.aura_hse_ptws
  add column if not exists closed_by text,
  add column if not exists closed_at timestamptz;

-- @DOWN
alter table public.aura_hse_ptws
  drop column if exists closed_by,
  drop column if exists closed_at;

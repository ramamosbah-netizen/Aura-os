-- ============================================================
-- AURA OS — migration 0119: HR employee reporting line (org chart)
-- ------------------------------------------------------------
-- Self-referential manager link; the org chart is derived from these reporting lines.
-- ============================================================

alter table public.aura_hr_employees
  add column if not exists manager_id text;

create index if not exists idx_hr_employees_manager on public.aura_hr_employees (manager_id);

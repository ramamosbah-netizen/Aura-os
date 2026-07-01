-- ============================================================
-- AURA OS — migration 0086: HR employee WPS payout fields
-- ------------------------------------------------------------
-- Employee salary bank details needed to generate the UAE WPS SIF
-- (IBAN, MoHRE/labour-card person id, bank/agent routing code).
-- ============================================================

alter table public.aura_hr_employees
  add column if not exists iban              text,
  add column if not exists mol_employee_id   text,
  add column if not exists bank_routing_code text;

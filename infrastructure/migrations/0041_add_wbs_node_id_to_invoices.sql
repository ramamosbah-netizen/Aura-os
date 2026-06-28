-- ============================================================
-- AURA OS — migration 0041: Add wbs_node_id to finance invoices
-- ------------------------------------------------------------
-- Adds the missing wbs_node_id column to aura_finance_invoices
-- to match the database query schema.
-- ============================================================

alter table public.aura_finance_invoices add column if not exists wbs_node_id text;

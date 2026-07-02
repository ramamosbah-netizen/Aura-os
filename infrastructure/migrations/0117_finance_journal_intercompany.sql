-- ============================================================
-- AURA OS — migration 0117: Intercompany tag on GL journals
-- ------------------------------------------------------------
-- Marks a journal as an intra-group (intercompany) transaction with another group company.
-- Group consolidation reverses these entries so intra-group revenue/expense and
-- receivables/payables net to zero (true consolidation, not a naive company sum).
-- ============================================================

alter table public.aura_finance_journals
  add column if not exists counterparty_company_id text;

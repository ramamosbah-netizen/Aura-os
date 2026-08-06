-- ============================================================
-- AURA OS — migration 0222: contract original (award) value
-- ------------------------------------------------------------
-- The AR billing cap bills against the contract value, and the value the client
-- can be billed for legitimately grows with APPROVED variations. Until now the
-- link was missing: variations rolled up into a derived "revised contract
-- value" on the project side while the contract's own value never moved, so an
-- approved variation did not raise the billing ceiling.
--
-- Splitting the awarded value from the live one is what makes that link safe to
-- automate: `value` stays the live figure everything already reads, and
-- `original_value` preserves the award, so the variation roll-up is a RECOMPUTE
-- (original + Σ approved variations) rather than an increment. A replayed
-- outbox delivery therefore cannot inflate the contract twice.
-- ============================================================

alter table public.aura_contracts_contracts
  add column if not exists original_value numeric not null default 0;

-- Backfill: every existing contract's award value is its current value.
update public.aura_contracts_contracts set original_value = value where original_value = 0;

-- @DOWN
alter table public.aura_contracts_contracts drop column if exists original_value;

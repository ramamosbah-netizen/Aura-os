-- ============================================================
-- AURA OS — migration 0052: RLS policy for bank transactions
-- ------------------------------------------------------------
-- Closes a Law #7 gap: aura_finance_bank_transactions had RLS
-- ENABLED (0046) but NO policy attached — under RLS that is
-- deny-all. The table was simply omitted from the 0032 policy
-- list (it landed in a later migration). This attaches the same
-- standard tenant-isolation policy its sibling finance tables use.
--
-- tenant-only form (the table has tenant_id but no company_id),
-- mirroring the 0032 tenant_isolation_policy branch verbatim.
-- ============================================================

alter table public.aura_finance_bank_transactions enable row level security;

drop policy if exists tenant_isolation_policy on public.aura_finance_bank_transactions;

create policy tenant_isolation_policy on public.aura_finance_bank_transactions
  for all
  using (
    tenant_id = public.current_tenant_id()
  );

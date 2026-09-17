-- ============================================================
-- AURA OS — migration 0348: FX provenance on booked invoices (FX-01)
-- ------------------------------------------------------------
-- `exchange_rate = 4.0103` does not say why it was 4.0103 or where it came from. FX-01 was possible
-- precisely because a booked rate carried no provenance: a hardcoded peg, a governed rate and an
-- invented cross-rate were indistinguishable once persisted.
--
-- Each booked invoice now records WHICH governed rate valued it:
--   exchange_rate_effective_date — the date that rate took effect (not the date it was applied)
--   exchange_rate_source         — identity | stored | stored-inverse | registered | registered-inverse
--   exchange_rate_id             — the aura_exchange_rates row, so the number can be traced to its row
--
-- EXISTING ROWS ARE LEFT NULL AND ARE NOT BACKFILLED. A NULL here means "booked before FX-01,
-- provenance unknown" — which is the honest value and the marker the historical impact audit needs.
-- Backfilling it from today's rates would erase exactly the evidence that audit depends on (§22:
-- absence is UNKNOWN, never a manufactured value).
--
-- invoice_date is added to AP because the FX asOf must be the date the SUPPLIER issued the invoice,
-- not the date somebody typed it in. AR already carries issue_date and needs no equivalent.
-- ============================================================

alter table public.aura_finance_invoices
  add column if not exists invoice_date                 date,
  add column if not exists exchange_rate_effective_date date,
  add column if not exists exchange_rate_source         text,
  add column if not exists exchange_rate_id             uuid;

alter table public.aura_finance_customer_invoices
  add column if not exists exchange_rate_effective_date date,
  add column if not exists exchange_rate_source         text,
  add column if not exists exchange_rate_id             uuid;

-- The audit read: which booked foreign-currency invoices carry no provenance at all.
create index if not exists idx_aura_finance_invoices_fx_provenance
  on public.aura_finance_invoices (tenant_id, currency)
  where exchange_rate_source is null;

create index if not exists idx_aura_finance_customer_invoices_fx_provenance
  on public.aura_finance_customer_invoices (tenant_id, currency)
  where exchange_rate_source is null;

-- @DOWN
drop index if exists public.idx_aura_finance_customer_invoices_fx_provenance;
drop index if exists public.idx_aura_finance_invoices_fx_provenance;
alter table public.aura_finance_customer_invoices
  drop column if exists exchange_rate_id,
  drop column if exists exchange_rate_source,
  drop column if exists exchange_rate_effective_date;
alter table public.aura_finance_invoices
  drop column if exists exchange_rate_id,
  drop column if exists exchange_rate_source,
  drop column if exists exchange_rate_effective_date,
  drop column if exists invoice_date;

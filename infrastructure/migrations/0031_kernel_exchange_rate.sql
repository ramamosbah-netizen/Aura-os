-- ============================================================
-- AURA OS kernel — migration 0031: multi-currency exchange rates
-- ------------------------------------------------------------
-- Tracks daily or standard exchange rates between currencies.
-- ============================================================

create table if not exists public.aura_exchange_rates (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      text        not null,
  from_currency  text        not null,
  to_currency    text        not null,
  rate           numeric(12,6) not null,
  effective_date date        not null,
  created_at     timestamptz not null default now(),
  constraint uq_aura_exchange_rates unique (tenant_id, from_currency, to_currency, effective_date)
);

alter table public.aura_exchange_rates enable row level security;

-- ============================================================
-- AURA OS — migration 0188: Market Intelligence catalogue
-- ------------------------------------------------------------
-- The reference numbers behind pricing: one row per thing we sell or install, with
-- what it TYPICALLY costs, sells for, and takes to install. When an estimator adds a
-- line to a pricing sheet, the suggested cost / price / labour come from here, so a
-- fair number is the default rather than a guess living in someone's head.
--
-- Benchmarks, not a customer price list — hence source + as_of: a benchmark with no
-- provenance is a rumour. "Hikvision distributor offer, 2026-06" can be trusted and
-- aged; a bare number cannot.
-- ============================================================

create table if not exists public.aura_crm_market_items (
  id             uuid        primary key,
  tenant_id      text        not null,
  name           text        not null,
  brand          text,
  -- CCTV | ACCESS_CONTROL | FIRE_ALARM | PA_VA | NETWORK | INTERCOM | BMS |
  -- STRUCTURED_CABLING | AUDIO_VISUAL | OTHER
  category       text        not null default 'OTHER',
  unit           text        not null default 'each',
  benchmark_cost numeric(18,2) not null default 0,
  benchmark_sell numeric(18,2) not null default 0,
  -- Typical installation time per unit, in hours — the labour a naive cost forgets.
  install_hours  numeric(10,2) not null default 0,
  source         text,
  as_of          date        not null default current_date,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     text
);

-- The estimator's search: by name/brand, filtered by category.
create index if not exists idx_aura_crm_market_items_name
  on public.aura_crm_market_items (tenant_id, name);
create index if not exists idx_aura_crm_market_items_category
  on public.aura_crm_market_items (tenant_id, category);

-- Tenant isolation, the enforced way (0163/0164) — enabled, FORCED, and policied.
-- NOT the pre-R1 "enable RLS, no policy" pattern, which is deny-all under `aura_app`.
alter table public.aura_crm_market_items enable row level security;
alter table public.aura_crm_market_items force row level security;

drop policy if exists tenant_isolation on public.aura_crm_market_items;
create policy tenant_isolation on public.aura_crm_market_items
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_crm_market_items;

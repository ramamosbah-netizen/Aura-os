-- ============================================================
-- AURA OS — migration 0191: the PricingSheet aggregate
-- ------------------------------------------------------------
-- Pricing stops being a JSON pocket inside the quotation and becomes its own
-- aggregate: Opportunity → PricingSheet (the workspace) → freeze → Baseline →
-- Quotation. The sheet is the source of truth for how a price was built; the
-- quotation is generated FROM it. A first-class table is what buys several sheets
-- per opportunity (option A vs B), version comparison, reuse, and historical
-- analysis — none of which a jsonb field on the quote could offer.
--
-- Lifecycle: draft → frozen. Freezing is the commercial commitment — the build-up
-- becomes immutable; re-pricing is a NEW version (parent_sheet_id chain), the same
-- discipline as quotation revisions and the R3 baseline.
-- ============================================================

create table if not exists public.aura_crm_pricing_sheets (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,
  name             text        not null,
  opportunity_id   text,
  quotation_id     text,
  version          integer     not null default 1,
  parent_sheet_id  uuid,
  -- draft | frozen
  status           text        not null default 'draft',
  -- EstimationLineInput[] — the per-line build-ups (materials, labour, loadings, margin).
  lines            jsonb       not null default '[]'::jsonb,
  -- Cached rollup, refreshed on save, so lists don't re-run the engine.
  total_cost       numeric(18,2) not null default 0,
  total_sell       numeric(18,2) not null default 0,
  margin_percent   numeric(6,2)  not null default 0,
  frozen_at        timestamptz,
  frozen_by        text,
  created_at       timestamptz not null default now(),
  created_by       text
);

-- The two reads: every sheet on a deal, and the sheet(s) behind a quotation.
create index if not exists idx_aura_pricing_sheets_opportunity
  on public.aura_crm_pricing_sheets (tenant_id, opportunity_id);
create index if not exists idx_aura_pricing_sheets_quotation
  on public.aura_crm_pricing_sheets (tenant_id, quotation_id);

-- Tenant isolation, the enforced way (0163/0164) — enabled, FORCED, and policied.
alter table public.aura_crm_pricing_sheets enable row level security;
alter table public.aura_crm_pricing_sheets force row level security;

drop policy if exists tenant_isolation on public.aura_crm_pricing_sheets;
create policy tenant_isolation on public.aura_crm_pricing_sheets
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_crm_pricing_sheets;

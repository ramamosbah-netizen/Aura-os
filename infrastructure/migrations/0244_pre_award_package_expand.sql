-- ============================================================
-- AURA OS — migration 0244: Pre-Award Package + Estimation revisions (EXPAND phase only)
-- ------------------------------------------------------------
-- Phase 1 / Expand of the Pre-Award program. PURELY ADDITIVE DDL — tables + columns + constraints +
-- indexes + RLS. NOTHING behavioural: no triggers, no backfill, no dual-write, no cutover (all in
-- separate reviewed PRs). Immutability / freeze-on-reference is a LIFECYCLE behaviour owned by the
-- application command that performs the transition — it is deliberately NOT modelled with DB triggers
-- here (nor even as un-attached functions).
--
-- Column types + jsonb shapes were preflighted against the live tables so the proposed schema can
-- represent every audited current field WITHOUT precision or structural loss. (Actual lossless
-- migration remains to be PROVEN by Backfill + Reconcile — this phase only establishes capacity.)
--   aura_tendering_rate_buildups: money numeric(18,2), percents numeric(6,2), components/resources jsonb
--   → aura_crm_estimate_build_ups mirrors those types exactly.
--   PricingRevision already EXISTS as aura_crm_pricing_sheets (row-per-version: version+parent_sheet_id,
--   status draft|frozen) — so quotation links to pricing_sheets(id); NO new pricing_revisions table.
--
-- Cross-module refs stay TEXT + app-enforced (CRM schema never hard-depends on Tendering schema):
--   pre_award_packages.tender_id, estimate_sources.estimate_build_up_id.
-- No CASCADE anywhere on the evidence/revision chain — deleting a package must NEVER silently erase
-- Basis → Estimate → Build-ups → sourcing history. Default is ON DELETE RESTRICT.
--
-- Same-tenant / same-package integrity: enforced by (a) a COMPOUND FK for the one risky cross-ref
-- (estimate_revision → its basis must be in the SAME package), and (b) application commands for the
-- rest — NOT claimed from single-column FKs alone.
-- RLS: ENABLE + FORCE + the canonical tenant_isolation_policy (same mechanism as 0242/0243).
-- ============================================================

-- ── 1) PreAwardPackage — the aggregate (owner XOR opportunity|tender) ────────────────────────────
-- Owner columns are TEXT here. NOTE: this file is the AS-APPLIED record (both owners text). The
-- decision to make opportunity_id a real uuid FK → aura_crm_opportunities(id) is carried by a FORWARD
-- migration (0245), because 0244 was already applied — an applied migration is never edited in place.
create table if not exists public.aura_crm_pre_award_packages (
  id              uuid primary key,
  tenant_id       text not null,
  company_id      text,
  opportunity_id  text,                         -- Direct owner (0245 converts to uuid + FK)
  tender_id       text,                         -- Tender owner (cross-module text ref, app-enforced)
  route           text not null,
  status          text not null default 'open',
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint aura_pre_award_pkg_route_chk  check (route in ('direct','tender')),
  constraint aura_pre_award_pkg_status_chk check (status in ('open','in_review','issued','closed')),
  -- Route ⇔ owner consistency (subsumes XOR): direct⇒opportunity only, tender⇒tender only.
  constraint aura_pre_award_pkg_owner_chk check (
    (route = 'direct' and opportunity_id is not null and tender_id is null) or
    (route = 'tender' and tender_id     is not null and opportunity_id is null)
  ),
  -- Present in the as-applied schema.
  constraint uq_pre_award_pkg_tenant_id unique (tenant_id, id)
);
create index if not exists idx_pre_award_pkg_tenant on public.aura_crm_pre_award_packages (tenant_id);
create unique index if not exists uq_pre_award_pkg_opportunity on public.aura_crm_pre_award_packages (tenant_id, opportunity_id) where opportunity_id is not null;
create unique index if not exists uq_pre_award_pkg_tender      on public.aura_crm_pre_award_packages (tenant_id, tender_id)      where tender_id is not null;

-- ── 2) EstimationBasisRevision — the FROZEN projection the estimator built on ─────────────────────
create table if not exists public.aura_crm_estimation_basis_revisions (
  id              uuid primary key,
  tenant_id       text not null,
  company_id      text,
  package_id      uuid not null references public.aura_crm_pre_award_packages(id) on delete restrict,
  revision_no     integer not null,
  source_kind     text not null,
  source_id       text not null,                -- SolutionScope.id (direct) or BOQ.id (tender)
  source_rev_ref  text,                         -- provenance: source version/hash snapshotted
  status          text not null default 'draft',
  lines           jsonb not null default '[]'::jsonb, -- [{lineId, description, unit, quantity, sourceLineId}]
  created_by      text,
  created_at      timestamptz not null default now(),
  approved_by     text,
  approved_at     timestamptz,
  constraint uq_basis_rev_no        unique (package_id, revision_no),
  -- Target for the estimate→basis compound FK (same-package guarantee).
  constraint uq_basis_pkg_id        unique (package_id, id),
  constraint basis_rev_no_chk       check (revision_no > 0),
  constraint basis_source_kind_chk  check (source_kind in ('scope','boq')),
  constraint basis_status_chk       check (status in ('draft','approved','superseded'))
);
create index if not exists idx_basis_rev_tenant  on public.aura_crm_estimation_basis_revisions (tenant_id);
create index if not exists idx_basis_rev_package on public.aura_crm_estimation_basis_revisions (package_id, revision_no desc);

-- ── 3) EstimateRevision — immutable estimate built ON a specific basis revision (same package) ────
create table if not exists public.aura_crm_estimate_revisions (
  id                 uuid primary key,
  tenant_id          text not null,
  company_id         text,
  package_id         uuid not null,
  basis_revision_id  uuid not null,
  revision_no        integer not null,
  status             text not null default 'draft',
  totals             jsonb not null default '{}'::jsonb,
  created_by         text,
  created_at         timestamptz not null default now(),
  frozen_by          text,
  frozen_at          timestamptz,
  approved_by        text,
  approved_at        timestamptz,
  constraint uq_estimate_rev_no unique (package_id, revision_no),
  constraint estimate_rev_no_chk check (revision_no > 0),
  constraint estimate_status_chk check (status in ('draft','frozen','approved','superseded')),
  -- package FK (RESTRICT — no silent erase of the revision chain).
  constraint estimate_rev_package_fk foreign key (package_id)
    references public.aura_crm_pre_award_packages(id) on delete restrict,
  -- COMPOUND FK: an estimate's basis MUST belong to the SAME package (DB-enforced, not just app).
  constraint estimate_rev_basis_same_pkg_fk foreign key (package_id, basis_revision_id)
    references public.aura_crm_estimation_basis_revisions(package_id, id) on delete restrict
);
create index if not exists idx_estimate_rev_tenant  on public.aura_crm_estimate_revisions (tenant_id);
create index if not exists idx_estimate_rev_package on public.aura_crm_estimate_revisions (package_id, revision_no desc);
create index if not exists idx_estimate_rev_basis   on public.aura_crm_estimate_revisions (basis_revision_id);

-- ── 4) Estimate build-ups — one per basis line PER REVISION (types mirror rate_buildups exactly) ──
create table if not exists public.aura_crm_estimate_build_ups (
  id                    uuid primary key,
  tenant_id             text not null,
  company_id            text,
  estimate_revision_id  uuid not null references public.aura_crm_estimate_revisions(id) on delete restrict,
  basis_line_id         text not null,
  components            jsonb not null default '[]'::jsonb,
  resources             jsonb,
  indirect_percent      numeric(6,2)  not null default 0,
  overhead_percent      numeric(6,2)  not null default 0,
  risk_percent          numeric(6,2)  not null default 0,
  profit_percent        numeric(6,2)  not null default 0,
  direct_cost           numeric(18,2) not null default 0,
  indirect_amount       numeric(18,2) not null default 0,
  overhead_amount       numeric(18,2) not null default 0,
  risk_amount           numeric(18,2) not null default 0,
  profit_amount         numeric(18,2) not null default 0,
  selling_rate          numeric(18,2) not null default 0,
  notes                 text,
  created_by            text,
  created_at            timestamptz not null default now(),
  constraint uq_build_up_line_per_rev unique (estimate_revision_id, basis_line_id)
);
create index if not exists idx_build_up_tenant   on public.aura_crm_estimate_build_ups (tenant_id);
create index if not exists idx_build_up_revision on public.aura_crm_estimate_build_ups (estimate_revision_id);

-- ── RLS on the four new tables (same mechanism as 0242/0243) ─────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'aura_crm_pre_award_packages',
    'aura_crm_estimation_basis_revisions',
    'aura_crm_estimate_revisions',
    'aura_crm_estimate_build_ups'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='tenant_isolation_policy') then
      execute format(
        'create policy tenant_isolation_policy on public.%I for all using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null) with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)',
        t);
    end if;
  end loop;
end $$;

-- ── Nullable back-links on existing tables (kept ALONGSIDE their current owner columns) ───────────
-- CRM → package: real intra-module FKs (nullable; RESTRICT — a package can't be deleted out from
-- under a linked scope/pricing/quotation).
alter table public.aura_crm_solution_scopes add column if not exists package_id uuid references public.aura_crm_pre_award_packages(id) on delete restrict;
alter table public.aura_crm_pricing_sheets  add column if not exists package_id uuid references public.aura_crm_pre_award_packages(id) on delete restrict;
alter table public.aura_crm_pricing_sheets  add column if not exists estimate_revision_id uuid references public.aura_crm_estimate_revisions(id) on delete restrict;
alter table public.aura_crm_quotations      add column if not exists package_id uuid references public.aura_crm_pre_award_packages(id) on delete restrict;
-- PricingRevision already exists as aura_crm_pricing_sheets (versioned rows) — link to it directly.
alter table public.aura_crm_quotations      add column if not exists pricing_sheet_id uuid references public.aura_crm_pricing_sheets(id) on delete restrict;
-- Tendering → CRM build-up: TEXT ref only (no cross-module schema FK), app-enforced. Old
-- buildup_id/component_id are left UNTOUCHED (Backfill remaps into estimate_build_up_id).
alter table public.aura_tendering_estimate_sources add column if not exists estimate_build_up_id text;

-- @DOWN
alter table public.aura_tendering_estimate_sources drop column if exists estimate_build_up_id;
alter table public.aura_crm_quotations      drop column if exists pricing_sheet_id;
alter table public.aura_crm_quotations      drop column if exists package_id;
alter table public.aura_crm_pricing_sheets  drop column if exists estimate_revision_id;
alter table public.aura_crm_pricing_sheets  drop column if exists package_id;
alter table public.aura_crm_solution_scopes drop column if exists package_id;
drop table if exists public.aura_crm_estimate_build_ups;
drop table if exists public.aura_crm_estimate_revisions;
drop table if exists public.aura_crm_estimation_basis_revisions;
drop table if exists public.aura_crm_pre_award_packages;

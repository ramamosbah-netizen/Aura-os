-- ============================================================
-- AURA OS — migration 0177: account installed base (§26 — C3)
-- ------------------------------------------------------------
-- After delivery the CRM forgot what the customer actually HAS, so "what should we sell next?"
-- had no factual answer. One row per installed ELV system per account (optionally per site):
--
--   system              — the canonical ELV code (same vocabulary as the G4 lead context)
--   provider            — us / competitor / unknown: WHOSE kit it is (the displacement axis)
--   warranty_expires_at — our warranty running out is the AMC conversation moment
--   amc_status/expires  — ours / competitor / none: the recurring-revenue axis
--   project_id          — lineage back to the delivering project when we installed it
--
-- White-space, replacement, AMC cross-sell and renewal findings are DERIVED per read and become
-- deduplicated SIGNALS on the S3 radar (§26: signals first, never auto-created opportunities).
-- ============================================================

create table if not exists public.aura_crm_installed_base (
  id                   uuid        primary key,
  tenant_id            text        not null,
  company_id           text,
  account_id           uuid        not null references public.aura_crm_accounts(id) on delete cascade,
  system               text        not null,
  site_name            text,
  provider             text        not null default 'unknown',
  competitor_name      text,
  installed_at         date,
  warranty_expires_at  date,
  amc_status           text        not null default 'unknown',
  amc_expires_at       date,
  project_id           text,
  notes                text,
  created_by           text,
  created_at           timestamptz not null default now()
);

create index if not exists idx_crm_installed_base_account on public.aura_crm_installed_base (tenant_id, account_id);

alter table public.aura_crm_installed_base enable row level security;
alter table public.aura_crm_installed_base force row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_installed_base' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_installed_base
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_crm_installed_base;

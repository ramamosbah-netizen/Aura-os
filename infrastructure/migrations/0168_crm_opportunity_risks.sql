-- ============================================================
-- AURA OS — migration 0168: Opportunity Risk register
-- ------------------------------------------------------------
-- The PERSISTED, editable counterpart to S7's derived AT_RISK health bands. An explicit risk
-- carries a likelihood × impact severity, an owner, a mitigation and a lifecycle
-- (OPEN → MITIGATING → RESOLVED | ACCEPTED). Open CRITICAL/HIGH risks feed the health engine.
-- Tenant-scoped + RLS. Additive.
-- ============================================================

create table if not exists public.aura_crm_opportunity_risks (
  id             uuid primary key,
  tenant_id      text not null,
  opportunity_id text not null,
  type           text not null default 'OTHER',
  title          text not null,
  description    text,
  likelihood     text not null default 'medium',
  impact         text not null default 'medium',
  severity       text not null default 'MEDIUM',
  evidence       text,
  owner          text,
  mitigation     text,
  target_date    text,
  status         text not null default 'OPEN',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_crm_opp_risks on public.aura_crm_opportunity_risks (tenant_id, opportunity_id);
create index if not exists idx_crm_opp_risks_open on public.aura_crm_opportunity_risks (tenant_id, status, severity);

-- RLS enabled + FORCED + policy, per the R1 fitness gate (apps/api/scripts/rls-fitness.mjs).
-- FORCE matters: without it the table owner bypasses its own policy, so isolation isn't enforced.
alter table public.aura_crm_opportunity_risks enable row level security;
alter table public.aura_crm_opportunity_risks force  row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_opportunity_risks' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_opportunity_risks
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_crm_opportunity_risks;

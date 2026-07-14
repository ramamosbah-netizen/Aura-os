-- ============================================================
-- AURA OS — migration 0166: Pre-award discovery (Roadmap R4 / G-P1-3)
-- ------------------------------------------------------------
-- The structured front-half the audit found missing: Requirements (what the customer needs) and
-- Solution Scopes (the proposed solution as priceable scope lines) on an opportunity. An approved
-- scope generates a governed Quotation (R3), so the direct-sale path starts from a signed-off scope
-- rather than a free-form quote. Additive; RLS enabled + FORCED + policy per the R1 fitness gate.
-- ============================================================

create table if not exists public.aura_crm_requirements (
  id              uuid primary key,
  tenant_id       text not null,
  opportunity_id  text not null,
  title           text not null,
  detail          text,
  priority        text not null default 'should',
  status          text not null default 'open',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_crm_requirements_opp on public.aura_crm_requirements (tenant_id, opportunity_id);

create table if not exists public.aura_crm_solution_scopes (
  id                      uuid primary key,
  tenant_id               text not null,
  opportunity_id          text not null,
  title                   text not null,
  status                  text not null default 'draft',
  lines                   jsonb not null default '[]'::jsonb,
  total                   numeric not null default 0,
  approved_by             text,
  approved_at             timestamptz,
  generated_quotation_id  text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_crm_solution_scopes_opp on public.aura_crm_solution_scopes (tenant_id, opportunity_id);

alter table public.aura_crm_requirements      enable row level security;
alter table public.aura_crm_requirements      force  row level security;
alter table public.aura_crm_solution_scopes   enable row level security;
alter table public.aura_crm_solution_scopes   force  row level security;

do $$
declare t text;
begin
  foreach t in array array['aura_crm_requirements', 'aura_crm_solution_scopes'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='tenant_isolation_policy') then
      execute format(
        'create policy tenant_isolation_policy on public.%I for all '
        || 'using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null) '
        || 'with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)', t);
    end if;
  end loop;
end $$;

-- @DOWN
drop table if exists public.aura_crm_solution_scopes;
drop table if exists public.aura_crm_requirements;

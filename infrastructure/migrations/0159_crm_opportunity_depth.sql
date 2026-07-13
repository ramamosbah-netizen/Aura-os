-- ============================================================
-- AURA OS — migration 0159: Opportunity execution depth (S4)
-- ------------------------------------------------------------
-- Three child collections that make an Opportunity a deal command center:
--   • stakeholders — WHO is behind the deal (the buying committee map)
--   • deal team    — WHO on our side is working it
--   • commitments  — WHAT was promised (either direction); overdue ones feed attention/health
-- All tenant-scoped + RLS. Additive.
-- ============================================================

create table if not exists public.aura_crm_opportunity_stakeholders (
  id             uuid primary key,
  tenant_id      text not null,
  opportunity_id text not null,
  contact_id     text,
  contact_name   text not null,
  role           text not null default 'OTHER',
  influence      text not null default 'medium',
  decision_power boolean not null default false,
  sentiment      text not null default 'neutral',
  is_champion    boolean not null default false,
  is_primary     boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_opp_stakeholders on public.aura_crm_opportunity_stakeholders (tenant_id, opportunity_id);

create table if not exists public.aura_crm_opportunity_deal_team (
  id             uuid primary key,
  tenant_id      text not null,
  opportunity_id text not null,
  user_id        text not null,
  user_name      text,
  role           text not null default 'OTHER',
  responsibility text,
  active         boolean not null default true,
  joined_at      timestamptz not null default now()
);
create index if not exists idx_crm_opp_deal_team on public.aura_crm_opportunity_deal_team (tenant_id, opportunity_id);

create table if not exists public.aura_crm_commitments (
  id            uuid primary key,
  tenant_id     text not null,
  related_type  text not null default 'opportunity',
  related_id    text not null,
  direction     text not null,
  committed_by  text,
  committed_to  text,
  description   text not null,
  due_at        text,
  status        text not null default 'OPEN',
  evidence      text,
  fulfilled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_crm_commitments on public.aura_crm_commitments (tenant_id, related_type, related_id);
create index if not exists idx_crm_commitments_open on public.aura_crm_commitments (tenant_id, status, due_at);

do $$
declare t text;
begin
  foreach t in array array[
    'aura_crm_opportunity_stakeholders','aura_crm_opportunity_deal_team','aura_crm_commitments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation_policy'
    ) then
      execute format(
        'create policy tenant_isolation_policy on public.%I using (tenant_id = public.current_tenant_id())', t);
    end if;
  end loop;
end $$;

-- @DOWN
drop table if exists public.aura_crm_commitments;
drop table if exists public.aura_crm_opportunity_deal_team;
drop table if exists public.aura_crm_opportunity_stakeholders;

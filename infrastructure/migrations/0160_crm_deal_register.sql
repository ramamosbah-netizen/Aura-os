-- ============================================================
-- AURA OS — migration 0160: Deal Register (Decisions / Assumptions / Open Questions) (S5)
-- ------------------------------------------------------------
-- One polymorphic log per opportunity (or any deal-chain record): the calls made,
-- the beliefs bet on, the questions still hanging. Material + unresolved items feed
-- deal risk. Tenant-scoped + RLS. Additive.
-- ============================================================

create table if not exists public.aura_crm_deal_register (
  id           uuid primary key,
  tenant_id    text not null,
  related_type text not null default 'opportunity',
  related_id   text not null,
  kind         text not null,          -- DECISION | ASSUMPTION | OPEN_QUESTION
  statement    text not null,
  status       text not null default 'OPEN',
  detail       text,
  owner        text,
  due_at       text,
  confidence   integer,
  resolved_by  text,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_crm_deal_register on public.aura_crm_deal_register (tenant_id, related_type, related_id);
create index if not exists idx_crm_deal_register_open on public.aura_crm_deal_register (tenant_id, status, due_at);

alter table public.aura_crm_deal_register enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_deal_register' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_deal_register
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_crm_deal_register;

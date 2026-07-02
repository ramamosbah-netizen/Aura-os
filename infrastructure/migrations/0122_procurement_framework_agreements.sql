-- ============================================================
-- AURA OS — migration 0122: procurement framework agreements
-- ------------------------------------------------------------
-- Blanket supplier agreements: rate card (jsonb), validity window, ceiling value,
-- running called-off value. Call-off POs draw down the ceiling.
-- ============================================================

create table if not exists public.aura_procurement_framework_agreements (
  id               uuid primary key,
  tenant_id        text not null,
  company_id       text,
  reference        text,
  title            text not null,
  supplier_id      uuid not null,
  supplier_name    text,
  status           text not null default 'draft',
  valid_from       date not null,
  valid_to         date not null,
  ceiling_value    numeric(18,2) not null default 0,
  called_off_value numeric(18,2) not null default 0,
  items            jsonb not null default '[]'::jsonb,
  notes            text,
  created_by       text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_framework_agreements_tenant   on public.aura_procurement_framework_agreements (tenant_id);
create index if not exists idx_framework_agreements_supplier on public.aura_procurement_framework_agreements (supplier_id);

alter table public.aura_procurement_framework_agreements enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_procurement_framework_agreements' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_procurement_framework_agreements
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

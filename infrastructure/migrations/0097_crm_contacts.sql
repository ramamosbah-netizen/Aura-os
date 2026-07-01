-- ============================================================
-- AURA OS — migration 0097: CRM contacts (people at an account)
-- ------------------------------------------------------------
-- A contact is a person at a customer/prospect account. References the account
-- by id + name snapshot (no FK join, matching the deal-chain snapshot design).
-- ============================================================

create table if not exists public.aura_crm_contacts (
  id            uuid primary key,
  tenant_id     text not null,
  company_id    text,
  account_id    text,
  account_name  text,
  name          text not null,
  job_title     text,
  email         text,
  phone         text,
  is_primary    boolean not null default false,
  status        text not null default 'active',
  owner_id      text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_crm_contacts_tenant   on public.aura_crm_contacts (tenant_id);
create index if not exists idx_crm_contacts_account  on public.aura_crm_contacts (account_id);

alter table public.aura_crm_contacts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_contacts' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_contacts
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

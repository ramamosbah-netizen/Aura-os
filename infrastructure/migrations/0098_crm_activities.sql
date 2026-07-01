-- ============================================================
-- AURA OS — migration 0098: CRM activities (interactions + tasks)
-- ------------------------------------------------------------
-- A logged interaction (call/email/meeting/note) or a to-do (task) attached to
-- something in the deal chain by polymorphic reference (related_type + related_id).
-- ============================================================

create table if not exists public.aura_crm_activities (
  id            uuid primary key,
  tenant_id     text not null,
  company_id    text,
  type          text not null,
  subject       text not null,
  notes         text,
  related_type  text,
  related_id    text,
  due_date      text,
  status        text not null default 'open',
  completed_at  timestamptz,
  assignee_id   text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_crm_activities_tenant  on public.aura_crm_activities (tenant_id);
create index if not exists idx_crm_activities_related on public.aura_crm_activities (related_type, related_id);
create index if not exists idx_crm_activities_status  on public.aura_crm_activities (tenant_id, status, due_date);

alter table public.aura_crm_activities enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_activities' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_activities
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

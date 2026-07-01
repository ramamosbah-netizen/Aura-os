-- ============================================================
-- AURA OS — migration 0105: Engineering technical queries (TQ)
-- ------------------------------------------------------------
-- Contractor → consultant design clarification/decision requests, carrying discipline,
-- priority, drawing reference and cost/time-impact flags. Lifecycle open → responded → closed.
-- ============================================================

create table if not exists public.aura_engineering_technical_queries (
  id                uuid primary key,
  tenant_id         text not null,
  company_id        text,
  code              text not null,
  title             text not null,
  query             text not null,
  response          text,
  status            text not null default 'open',
  priority          text not null default 'medium',
  discipline        text not null default 'other',
  drawing_reference text,
  cost_impact       boolean not null default false,
  time_impact       boolean not null default false,
  project_id        text not null,
  project_name      text,
  assigned_to       text,
  responded_at      timestamptz,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_eng_tq_tenant  on public.aura_engineering_technical_queries (tenant_id);
create index if not exists idx_eng_tq_project on public.aura_engineering_technical_queries (project_id, status);

alter table public.aura_engineering_technical_queries enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_engineering_technical_queries' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_engineering_technical_queries
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

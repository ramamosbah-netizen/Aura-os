-- ============================================================
-- AURA OS — migration 0103: Doc-Control drawing / document register
-- ------------------------------------------------------------
-- The controlled register of every drawing/document on a project: number, current
-- revision, status, custodian, and distribution list (the distribution matrix).
-- ============================================================

create table if not exists public.aura_doccontrol_drawing_register (
  id               uuid primary key,
  tenant_id        text not null,
  company_id       text,
  project_id       text not null,
  project_name     text,
  document_number  text not null,
  title            text not null,
  discipline       text not null default 'other',
  doc_type         text not null default 'drawing',
  current_revision text not null default 'A',
  status           text not null default 'draft',
  custodian        text,
  distribution     jsonb not null default '[]'::jsonb,
  revision_date    date,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_doccontrol_register_tenant  on public.aura_doccontrol_drawing_register (tenant_id);
create index if not exists idx_doccontrol_register_project on public.aura_doccontrol_drawing_register (project_id, document_number);

alter table public.aura_doccontrol_drawing_register enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_doccontrol_drawing_register' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_doccontrol_drawing_register
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

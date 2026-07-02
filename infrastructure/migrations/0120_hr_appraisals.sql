-- ============================================================
-- AURA OS — migration 0120: HR performance appraisals
-- ------------------------------------------------------------
-- Review-cycle records: weighted competency criteria (jsonb) → overall 0–100 rating,
-- draft → submitted → acknowledged lifecycle.
-- ============================================================

create table if not exists public.aura_hr_appraisals (
  id              uuid primary key,
  tenant_id       text not null,
  company_id      text,
  employee_id     text not null,
  employee_name   text,
  period          text not null,
  reviewer_id     text,
  criteria        jsonb not null default '[]'::jsonb,
  overall_score   numeric(6,2) not null default 0,
  status          text not null default 'draft',
  strengths       text,
  improvements    text,
  comments        text,
  submitted_at    timestamptz,
  acknowledged_at timestamptz,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_hr_appraisals_tenant   on public.aura_hr_appraisals (tenant_id);
create index if not exists idx_hr_appraisals_employee on public.aura_hr_appraisals (employee_id);

alter table public.aura_hr_appraisals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_hr_appraisals' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_hr_appraisals
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- ============================================================
-- AURA OS — migration 0106: HSE Safety Training Matrix Table
-- ------------------------------------------------------------
-- Namespaced under aura_hse_*. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_hse_safety_training (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  worker_name     text        not null,
  worker_id       text        not null,
  induction_date  date        not null,
  card_number     text,
  card_expiry     date,
  certifications  jsonb       not null default '[]'::jsonb,
  status          text        not null default 'valid', -- valid | expired
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, worker_id)
);

create index if not exists idx_aura_hse_training_worker on public.aura_hse_safety_training (tenant_id, worker_id);

alter table public.aura_hse_safety_training enable row level security;

drop policy if exists tenant_isolation_policy on public.aura_hse_safety_training;

create policy tenant_isolation_policy on public.aura_hse_safety_training
for all
using (
  tenant_id = public.current_tenant_id()
  and (
    company_id is null 
    or public.current_company_id() is null 
    or company_id = public.current_company_id()
  )
);

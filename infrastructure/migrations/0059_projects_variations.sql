-- ============================================================
-- AURA OS — migration 0059: Project Variation Orders (change orders)
-- ------------------------------------------------------------
-- A variation order is a contractual change to a project's scope/
-- value — an addition (+) or omission (−) — carried through an
-- approval workflow. Approved variations roll up into the
-- project's revised contract value.
-- ============================================================

create table if not exists public.aura_projects_variations (
  id            uuid          primary key,
  tenant_id     text          not null,
  company_id    text,
  project_id    text          not null,
  project_title text,
  reference     text,
  title         text          not null,
  description   text,
  type          text          not null,             -- 'addition' | 'omission'
  amount        numeric(15,2) not null,             -- positive magnitude
  signed_amount numeric(15,2) not null,             -- +amount / −amount
  status        text          not null default 'draft', -- draft|submitted|approved|rejected
  created_by    text,
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz   not null default now()
);
create index if not exists idx_aura_variations_project on public.aura_projects_variations (tenant_id, project_id, status);

alter table public.aura_projects_variations enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_projects_variations;
create policy tenant_isolation_policy on public.aura_projects_variations
  for all using (tenant_id = public.current_tenant_id());

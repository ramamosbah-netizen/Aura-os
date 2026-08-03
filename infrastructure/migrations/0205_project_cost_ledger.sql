-- ============================================================
-- AURA OS — migration 0205: project cost ledger (Transaction Engine)
-- ------------------------------------------------------------
-- The append-only sub-ledger between the ERP modules and the CBS. Every money-bearing event posts a
-- transaction here (type = committed | actual; amount may be negative for credit notes / reversals /
-- returns) coded to a CBS node — the CBS balance is SUM(this), never a manual number. `dimensions`
-- is a free-form jsonb bag (costCode, location, supplier, drawing, boqItem, activity, floor, zone…)
-- so cost can be sliced any way later without a schema change. Owned by projects.
-- ============================================================

create table if not exists public.aura_projects_cost_ledger (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  project_id   text        not null,
  cbs_node_id  text,
  wbs_node_id  text,
  -- committed | actual
  type         text        not null,
  amount       numeric     not null default 0,
  quantity     numeric,
  -- po | invoice | material_issue | material_return | plant_usage | labour_timesheet |
  -- subcontract_claim | variation | expense | credit_note | reversal | adjustment | other
  source       text        not null,
  source_ref   text,
  dimensions   jsonb,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  created_by   text
);

create index if not exists idx_aura_cost_ledger_project on public.aura_projects_cost_ledger (tenant_id, project_id);
create index if not exists idx_aura_cost_ledger_cbs     on public.aura_projects_cost_ledger (tenant_id, cbs_node_id);

alter table public.aura_projects_cost_ledger enable row level security;
alter table public.aura_projects_cost_ledger force row level security;

drop policy if exists tenant_isolation on public.aura_projects_cost_ledger;
create policy tenant_isolation on public.aura_projects_cost_ledger
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_projects_cost_ledger;

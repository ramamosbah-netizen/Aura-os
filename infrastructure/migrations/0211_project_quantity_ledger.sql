-- ============================================================
-- AURA OS — migration 0211: project quantity ledger (the physical twin of the cost ledger)
-- ------------------------------------------------------------
-- The append-only sub-ledger of PHYSICAL quantities, keyed to a BOQ (measured) item the way the cost
-- ledger is keyed to a CBS node. Every quantity-bearing event posts here (type = boq | ordered |
-- received | issued | installed | approved | invoiced; quantity may be negative for returns /
-- rejects / reversals). A BOQ item's live position (ordered/received/issued/… vs the BOQ target) is
-- SUM(this), never a manual number. `dimensions` is a free-form jsonb bag (location, drawing, floor,
-- zone, supplier…) so quantities can be sliced any way later without a schema change. Owned by projects.
-- ============================================================

create table if not exists public.aura_projects_quantity_ledger (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  project_id   text        not null,
  boq_item_id  text        not null,
  cbs_node_id  text,
  -- boq | ordered | received | issued | installed | approved | invoiced
  type         text        not null,
  quantity     numeric     not null default 0,
  unit         text,
  -- boq_baseline | po | grn | material_issue | material_return | daily_report |
  -- installation | inspection | ipc | reversal | adjustment | other
  source       text        not null,
  source_ref   text,
  dimensions   jsonb,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  created_by   text
);

create index if not exists idx_aura_qty_ledger_project on public.aura_projects_quantity_ledger (tenant_id, project_id);
create index if not exists idx_aura_qty_ledger_boq     on public.aura_projects_quantity_ledger (tenant_id, boq_item_id);

alter table public.aura_projects_quantity_ledger enable row level security;
alter table public.aura_projects_quantity_ledger force row level security;

drop policy if exists tenant_isolation on public.aura_projects_quantity_ledger;
create policy tenant_isolation on public.aura_projects_quantity_ledger
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_projects_quantity_ledger;

-- ============================================================
-- AURA OS — migration 0228: Commissioning test sheet + punch list
-- ------------------------------------------------------------
-- Adds the itemized evidence behind the commissioning tally and the defect gate:
--   * aura_commissioning_test_items — one row per test point (expected vs actual + pass/fail),
--     the auditable test sheet behind the record's points_total/points_passed.
--   * aura_commissioning_punch_items — the punch list (defects). A record cannot be commissioned
--     while any punch item is open (enforced in the service) — the retest gate.
-- Both FORCE-RLS tenant-isolated.
-- ============================================================

create table if not exists public.aura_commissioning_test_items (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,
  commissioning_id uuid        not null,
  project_id       text        not null,
  point_no         text        not null,
  description      text        not null,
  expected         text,
  actual           text,
  result           text        not null default 'pending', -- pending | pass | fail
  remarks          text,
  tested_by        text,
  tested_at        timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_cx_test_items_record on public.aura_commissioning_test_items (tenant_id, commissioning_id);

alter table public.aura_commissioning_test_items enable row level security;
alter table public.aura_commissioning_test_items force row level security;
drop policy if exists tenant_isolation on public.aura_commissioning_test_items;
create policy tenant_isolation on public.aura_commissioning_test_items
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

create table if not exists public.aura_commissioning_punch_items (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,
  commissioning_id uuid        not null,
  project_id       text        not null,
  description      text        not null,
  severity         text        not null default 'minor', -- minor | major | critical
  location         text,
  status           text        not null default 'open',  -- open | closed
  raised_by        text,
  resolution       text,
  closed_by        text,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_cx_punch_items_record on public.aura_commissioning_punch_items (tenant_id, commissioning_id);

alter table public.aura_commissioning_punch_items enable row level security;
alter table public.aura_commissioning_punch_items force row level security;
drop policy if exists tenant_isolation on public.aura_commissioning_punch_items;
create policy tenant_isolation on public.aura_commissioning_punch_items
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_commissioning_punch_items;
drop table if exists public.aura_commissioning_test_items;

-- ============================================================
-- AURA OS — migration 0125: soft-delete standardization
-- ------------------------------------------------------------
-- Extends the customer-invoice soft-delete reference (0116) to the remaining record
-- masters with hard-delete endpoints: assets, HR employees, fleet vehicles, budgets.
-- DELETE endpoints now set deleted_at; POST :id/restore clears it.
-- ============================================================

alter table public.aura_assets            add column if not exists deleted_at timestamptz;
alter table public.aura_hr_employees      add column if not exists deleted_at timestamptz;
alter table public.aura_fleet_vehicles    add column if not exists deleted_at timestamptz;
alter table public.aura_finance_budgets   add column if not exists deleted_at timestamptz;

create index if not exists idx_aura_assets_live          on public.aura_assets (tenant_id)          where deleted_at is null;
create index if not exists idx_aura_hr_employees_live    on public.aura_hr_employees (tenant_id)    where deleted_at is null;
create index if not exists idx_aura_fleet_vehicles_live  on public.aura_fleet_vehicles (tenant_id)  where deleted_at is null;
create index if not exists idx_aura_finance_budgets_live on public.aura_finance_budgets (tenant_id) where deleted_at is null;

-- @DOWN
drop index if exists idx_aura_assets_live;
drop index if exists idx_aura_hr_employees_live;
drop index if exists idx_aura_fleet_vehicles_live;
drop index if exists idx_aura_finance_budgets_live;
alter table public.aura_assets            drop column if exists deleted_at;
alter table public.aura_hr_employees      drop column if exists deleted_at;
alter table public.aura_fleet_vehicles    drop column if exists deleted_at;
alter table public.aura_finance_budgets   drop column if exists deleted_at;

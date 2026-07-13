-- ============================================================
-- AURA OS — migration 0162: CRM Forecast Snapshots (S8)
-- ------------------------------------------------------------
-- An append-only, immutable weekly roll of the weighted pipeline, one row per expected-close
-- period per capture (batch_id groups the periods of a single capture). Diffing two captures
-- makes slippage — value sliding into later months, deals falling out of the quarter — visible.
-- Never updated or deleted: history is the whole point.
-- ============================================================

create table if not exists public.aura_crm_forecast_snapshots (
  id               uuid primary key,
  batch_id         uuid not null,
  tenant_id        text not null,
  company_id       text,
  taken_at         timestamptz not null default now(),
  period           text not null,
  open_value       numeric not null default 0,
  weighted_value   numeric not null default 0,
  committed_value  numeric not null default 0,
  deal_count       integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists idx_crm_forecast_snap_tenant on public.aura_crm_forecast_snapshots (tenant_id, taken_at desc);
create index if not exists idx_crm_forecast_snap_batch  on public.aura_crm_forecast_snapshots (batch_id);

alter table public.aura_crm_forecast_snapshots enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_forecast_snapshots' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_forecast_snapshots
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_crm_forecast_snapshots;

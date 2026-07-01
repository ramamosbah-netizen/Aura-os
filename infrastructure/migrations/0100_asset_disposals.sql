-- ============================================================
-- AURA OS — migration 0100: Asset disposals (retirement + gain/loss)
-- ------------------------------------------------------------
-- Retiring an asset (sale/scrap/write-off/trade-in) records proceeds vs net book
-- value and the resulting gain/loss, and sets the asset status to 'disposed'. The
-- assets.asset.disposed event lets Finance post the disposal to the GL.
-- ============================================================

create table if not exists public.aura_asset_disposals (
  id             uuid primary key,
  tenant_id      text not null,
  company_id     text,
  asset_id       text not null,
  asset_name     text,
  disposal_date  date not null,
  method         text not null,
  proceeds       numeric(18,2) not null default 0,
  book_value     numeric(18,2) not null default 0,
  gain_loss      numeric(18,2) not null default 0,
  notes          text,
  created_by     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_asset_disposals_tenant on public.aura_asset_disposals (tenant_id);
create index if not exists idx_asset_disposals_asset  on public.aura_asset_disposals (asset_id);

alter table public.aura_asset_disposals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_asset_disposals' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_asset_disposals
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

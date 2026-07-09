-- ============================================================
-- AURA OS — migration 0132: Tenant settings (admin center)
-- ------------------------------------------------------------
-- Generic per-tenant key/value store for organisation-level
-- configuration that isn't its own subsystem — company name,
-- default currency, fiscal-year start, invoice footer, etc.
-- Read/written by the Administrator Center → Settings page and
-- consumed by modules to adapt behaviour per tenant. Backs
-- @aura/core SettingsService (Postgres mode).
-- ============================================================

create table if not exists public.aura_tenant_settings (
  tenant_id   text        not null,
  key         text        not null,
  value       text        not null default '',
  description text        not null default '',
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, key)
);

alter table public.aura_tenant_settings enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_tenant_settings;
create policy tenant_isolation_policy on public.aura_tenant_settings
  for all using (tenant_id = public.current_tenant_id());

-- @DOWN
drop table if exists public.aura_tenant_settings;

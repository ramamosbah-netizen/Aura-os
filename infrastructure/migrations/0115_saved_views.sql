-- ============================================================
-- AURA OS — migration 0093: Saved views (per-tenant list filters)
-- ============================================================
create table if not exists public.aura_saved_views (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  text        not null,
  user_id    text,
  label      text        not null,
  path       text        not null,
  query      text        not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_aura_saved_views_tenant on public.aura_saved_views (tenant_id, path);
alter table public.aura_saved_views enable row level security;
create policy saved_views_rls on public.aura_saved_views
  for all using (tenant_id = public.current_tenant_id());

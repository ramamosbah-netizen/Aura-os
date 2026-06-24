-- ============================================================
-- AURA OS kernel — migration 0001: append-only event ledger
-- ------------------------------------------------------------
-- The durable source of truth for the event spine + the transactional-outbox
-- source (a relay drains rows where processed_at IS NULL to the EventBus).
--
-- Namespaced `aura_*` because this database is currently SHARED with NEW-ERP
-- (its tables: system_events, event_types, ...). When AURA OS gets its own
-- Supabase project, this moves to a dedicated `aura` schema (schema-per-module).
--
-- Apply with `pnpm db:migrate` (needs DATABASE_URL in apps/api/.env.local), which
-- runs every migration once and tracks them in public.aura_migrations. The SQL
-- Editor still works as a manual fallback.
-- ============================================================

create table if not exists public.aura_events (
  id             uuid        primary key,
  type           text        not null,
  tenant_id      text        not null,
  company_id     text,
  aggregate_type text        not null,
  aggregate_id   text        not null,
  actor_id       text,
  occurred_at    timestamptz not null,
  version        integer     not null default 1,
  payload        jsonb       not null default '{}'::jsonb,
  -- outbox bookkeeping
  processed_at   timestamptz,
  processing_error text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_aura_events_unprocessed
  on public.aura_events (created_at) where processed_at is null;
create index if not exists idx_aura_events_tenant
  on public.aura_events (tenant_id, created_at desc);
create index if not exists idx_aura_events_type
  on public.aura_events (type);
create index if not exists idx_aura_events_aggregate
  on public.aura_events (aggregate_type, aggregate_id);

-- Lock the ledger down: enable RLS with no policies, so ONLY the service role
-- (the kernel/back-end, which bypasses RLS) can read/write it. No client access.
alter table public.aura_events enable row level security;

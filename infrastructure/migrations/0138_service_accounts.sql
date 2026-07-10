-- ============================================================
-- AURA OS — migration 0138: Service accounts / API keys (admin center)
-- ------------------------------------------------------------
-- Machine credentials for external integrations (Vol 15 §2.5 [Gap]):
-- a service account authenticates with an `aura_sk_…` bearer key and
-- acts as identity `sa:<id>`, authorized through the SAME role grants
-- as any user (grant roles at /admin/access). Only the SHA-256 hash of
-- the key is stored — the key itself is shown exactly once at creation.
-- ServiceAccountsService (@aura/core) hydrates on boot so verification
-- is a sync in-memory lookup on the request hot path.
-- ============================================================

create table if not exists public.aura_service_accounts (
  tenant_id    text        not null,
  id           text        not null,
  name         text        not null,
  key_hash     text        not null,
  active       boolean     not null default true,
  created_by   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (tenant_id, id)
);

create unique index if not exists aura_service_accounts_key_idx
  on public.aura_service_accounts (key_hash);

alter table public.aura_service_accounts enable row level security;

-- @DOWN
drop table if exists public.aura_service_accounts;

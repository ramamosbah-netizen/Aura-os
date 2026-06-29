-- ============================================================
-- AURA OS kernel — migration 0033: idempotency registry
-- ------------------------------------------------------------
-- Stores idempotency keys and cached response payloads to prevent
-- double-execution of API commands under network retry loops.
-- ============================================================

create table if not exists public.aura_idempotency_keys (
  idempotency_key text        not null,
  tenant_id       text        not null,
  response_status integer     not null,
  response_body   jsonb       not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  constraint pk_aura_idempotency_keys primary key (tenant_id, idempotency_key)
);

alter table public.aura_idempotency_keys enable row level security;

-- Policy to restrict key reads/writes to active tenant
create policy tenant_idempotency_policy on public.aura_idempotency_keys
  for all
  using (tenant_id = public.current_tenant_id());

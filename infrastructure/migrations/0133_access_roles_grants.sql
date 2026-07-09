-- ============================================================
-- AURA OS — migration 0133: Access roles & grants (admin center)
-- ------------------------------------------------------------
-- Persists the RBAC/ABAC store behind @aura/core AccessService so
-- roles and user grants survive restarts (gap register Vol 23 #12
-- remainder + #7 DB-backed grants). The service keeps decisions
-- in-memory (hot path stays sync) and write-throughs here; on boot
-- it hydrates from these tables. Tenancy is carried inside the
-- grant scope (org/resource node), not a column — these are
-- kernel-level tables like the workflow registry.
-- ============================================================

create table if not exists public.aura_access_roles (
  id          text        primary key,
  name        text        not null,
  permissions jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.aura_access_grants (
  user_id    text        not null,
  role_id    text        not null,
  scope_key  text        not null,
  scope      jsonb       not null,
  attributes jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, role_id, scope_key)
);

create index if not exists aura_access_grants_user_idx on public.aura_access_grants (user_id);

-- @DOWN
drop table if exists public.aura_access_grants;
drop table if exists public.aura_access_roles;

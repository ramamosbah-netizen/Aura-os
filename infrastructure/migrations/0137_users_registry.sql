-- ============================================================
-- AURA OS — migration 0137: Users registry (admin center depth)
-- ------------------------------------------------------------
-- A real user entity behind /admin/users (Vol 15 §2.2 "Users:
-- invite/deactivate, company assignment"): until now "users" were
-- just workspace role assignments + access grants keyed by id.
-- UsersService (@aura/core) write-throughs here and hydrates on
-- boot (the AccessService pattern) so the active flag is a sync
-- in-memory check on the request hot path: a deactivated user is
-- refused at login AND on every guarded request.
-- ============================================================

create table if not exists public.aura_users (
  tenant_id    text        not null,
  user_id      text        not null,
  display_name text        not null default '',
  email        text        not null default '',
  company_id   text,
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.aura_users enable row level security;

-- @DOWN
drop table if exists public.aura_users;

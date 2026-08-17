-- ============================================================
-- AURA OS — migration 0234: RLS policies for the identity tables
-- ------------------------------------------------------------
-- FORWARD migration. 0134/0137/0138 are already applied on real
-- databases and are recorded in aura_migrations, so editing them
-- would change nothing anywhere they matter. Everything here is
-- additive and idempotent.
--
-- THE DEFECT (measured against a real PostgreSQL engine, see
-- docs/reports/2026-08-17-auth-s1-identity-credential-mfa.md):
--
--   `alter table ... enable row level security` with NO policy
--   attached is default-DENY for every role that is not the table
--   owner. Under the G-03 posture the API connects as `aura_app`
--   (NOBYPASSRLS, and not the owner since schema work moved to
--   MIGRATION_DATABASE_URL), so these tables return ZERO rows to
--   the application while looking perfectly healthy to the owner
--   in psql:
--
--     RLS on, no policy:  owner → 1 row     aura_app → 0 rows
--
-- Why it is urgent now: authentication reads `aura_users` and
-- `auth_credentials`. "Zero rows" therefore means "nobody can log
-- in", not "some data is hidden". It was masked before the S1 auth
-- rebuild because login read no table at all and `isActive()`
-- answered true for unregistered ids — one defect concealing
-- another.
--
-- 103 post-0032 migrations attach a policy; 9 enable RLS without
-- one. This closes the identity subset of that gap.
-- ============================================================

-- ------------------------------------------------------------
-- 1. aura_users (0137) — registry read on every login + guard.
-- ------------------------------------------------------------
drop policy if exists aura_users_tenant on public.aura_users;
create policy aura_users_tenant on public.aura_users
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ------------------------------------------------------------
-- 2. aura_service_accounts (0138) — API-key identities.
-- ------------------------------------------------------------
drop policy if exists aura_service_accounts_tenant on public.aura_service_accounts;
create policy aura_service_accounts_tenant on public.aura_service_accounts
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ------------------------------------------------------------
-- 3. aura_user_mfa (0134) — TOTP secrets.
--
-- This one needed a schema change first: the table was keyed by
-- `user_id` ALONE, with no tenant column, so a TOTP secret had no
-- tenant identity to isolate on and RLS was never enabled on it.
-- A shared secret store across tenants is the wrong shape for a
-- multi-tenant platform — the same user id in two tenants is two
-- different people (that is exactly what aura_users' composite
-- primary key says).
--
-- Backfill uses AUTH_DEFAULT_TENANT's conventional value; existing
-- rows are dev/demo enrolments. The column is added NOT NULL with a
-- default so the backfill is atomic and no row can escape scoping.
-- ------------------------------------------------------------
alter table public.aura_user_mfa
  add column if not exists tenant_id text not null default 'dev-tenant';

-- Re-key: (tenant_id, user_id) is the real identity of an enrolment.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'aura_user_mfa_pkey'
       and conrelid = 'public.aura_user_mfa'::regclass
  ) then
    alter table public.aura_user_mfa drop constraint aura_user_mfa_pkey;
  end if;
end $$;

alter table public.aura_user_mfa
  add constraint aura_user_mfa_pkey primary key (tenant_id, user_id);

alter table public.aura_user_mfa enable row level security;
-- FORCE as well: `enable` alone exempts the owner, and the RLS fitness gate
-- (apps/api/scripts/rls-fitness.mjs) requires FORCE on every tenant-scoped aura_* table.
-- Adding tenant_id above is what brings this table into that scanned set for the first time.
alter table public.aura_user_mfa force row level security;

drop policy if exists aura_user_mfa_tenant on public.aura_user_mfa;
create policy aura_user_mfa_tenant on public.aura_user_mfa
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- @DOWN
drop policy if exists aura_user_mfa_tenant on public.aura_user_mfa;
alter table public.aura_user_mfa no force row level security;
alter table public.aura_user_mfa disable row level security;
alter table public.aura_user_mfa drop constraint if exists aura_user_mfa_pkey;
alter table public.aura_user_mfa add constraint aura_user_mfa_pkey primary key (user_id);
alter table public.aura_user_mfa drop column if exists tenant_id;
drop policy if exists aura_service_accounts_tenant on public.aura_service_accounts;
drop policy if exists aura_users_tenant on public.aura_users;

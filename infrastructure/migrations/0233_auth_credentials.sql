-- ============================================================
-- AURA OS — migration 0233: local account credentials (S1)
-- ------------------------------------------------------------
-- Until now there was no per-user credential anywhere in the
-- platform. `POST /auth/login` compared the submitted password
-- against a single deployment-wide AUTH_DEV_PASSWORD env var —
-- and when that var was unset it accepted ANY password, for a
-- username that itself defaulted to `u-admin`. An empty POST
-- body minted a wildcard platform-admin token.
--
-- Deliberately SEPARATE from aura_users: identity/business
-- record and authentication secret are different concerns with
-- different lifetimes, different RLS needs, and different
-- read paths. `SELECT * FROM aura_users` is done all over the
-- admin surface — it must never be able to carry a password
-- hash into a response payload. This also leaves room for the
-- identity to be authenticated by a hosted IdP (JWKS/Entra)
-- with no row here at all.
--
-- The lockout counters live HERE, not in per-node memory. The
-- previous in-memory throttle counted failures per process, so
-- an attacker spreading attempts across nodes (or waiting out a
-- restart) never tripped it. Persisted, the lockout is a
-- property of the account rather than of one server.
-- ============================================================

create table if not exists public.auth_credentials (
  -- Stable identity for the CREDENTIAL itself, distinct from the user it belongs to.
  -- Audit and session records reference this, so "which credential proved this session"
  -- survives the user being renamed or re-keyed, and a rotated credential is a new row
  -- rather than an indistinguishable overwrite.
  credential_id       uuid        not null default gen_random_uuid(),
  tenant_id           text        not null,
  user_id             text        not null,
  -- scrypt$<N>$<r>$<p>$<salt b64>$<hash b64> — see shared/src/identity/password.ts
  password_hash       text        not null,
  -- active | must_change | disabled. `disabled` refuses password login while leaving the
  -- identity intact (IdP-only accounts, or a credential suspended without deleting it).
  status              text        not null default 'active',
  password_changed_at timestamptz not null default now(),
  -- Persisted brute-force state (see note above).
  failed_attempts     integer     not null default 0,
  last_failed_at      timestamptz,
  locked_until        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (tenant_id, user_id),
  constraint auth_credentials_status_check check (status in ('active', 'must_change', 'disabled'))
);

alter table public.auth_credentials enable row level security;
-- FORCE, not just ENABLE: `enable` exempts the table OWNER, so migrations and any
-- owner-connected process would bypass the policy entirely. Migration 0163 forces every
-- tenant-scoped table for exactly this reason; a table holding password hashes is the last
-- one that should be the exception. Callers must therefore bind a tenant — including the
-- boot seeder, which wraps its writes in TenantContext.run().
alter table public.auth_credentials force row level security;

-- ------------------------------------------------------------
-- RLS policy. REQUIRED, not optional.
--
-- Enabling RLS without attaching a policy is default-DENY for any role that is not the
-- table owner: under the G-03 posture the API connects as `aura_app` (NOBYPASSRLS, and not
-- the owner since schema work moved to MIGRATION_DATABASE_URL), so an unpolicied table
-- returns ZERO rows to the application while looking perfectly healthy to the owner in psql.
-- Measured, not assumed — see docs/reports/2026-08-17-auth-s1-identity-credential-mfa.md.
--
-- That is fatal here specifically: authentication reads this table, so "no rows" means
-- "nobody can log in", not "some data is hidden".
--
-- FAIL-CLOSED, deliberately: no tenant context ⇒ no rows. The predicate is the same strict
-- equality 0032 uses everywhere else, with no `current_tenant_id() is null` escape hatch.
--
-- An earlier draft of this migration allowed the row when no tenant was bound, reasoning that
-- authentication precedes tenant context. That is the wrong trade: it makes the ONE table
-- holding password hashes the ONE table readable without a tenant, so any code path that
-- forgets to bind a tenant silently gets cross-tenant credential access instead of an error.
--
-- Login does not need the escape hatch, because login DOES know its tenant: it arrives in the
-- request (`tenantId`, defaulting to AUTH_DEFAULT_TENANT). AuthController binds it via
-- `TenantContext.run()` before authenticating, so `TenantScopedPool` puts it in the GUC and
-- this policy scopes the credential lookup to exactly the tenant the caller asked for.
--
-- The requested tenant is UNTRUSTED, and that is fine — it is a scoping key, not a grant.
-- Naming a tenant lets you attempt a login against it; the password still has to verify
-- against a credential inside it. What the policy guarantees is that the lookup can never
-- reach a credential outside the named tenant, even if application-layer filtering were wrong.
create policy auth_credentials_tenant on public.auth_credentials
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- @DOWN
drop policy if exists auth_credentials_tenant on public.auth_credentials;
drop table if exists public.auth_credentials;

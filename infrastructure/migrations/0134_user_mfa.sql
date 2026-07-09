-- ============================================================
-- AURA OS — migration 0134: Per-user MFA secrets (gap Vol 23 #13)
-- ------------------------------------------------------------
-- Persists TOTP enrolment for local (HS256 dev-login) accounts so
-- MFA survives restarts and the login endpoint can gate on it.
-- Two-step enrol: the secret lands here inactive; the first valid
-- code activates it (prevents locking out a user who never scanned
-- the QR). Entra/IdP users get MFA from the IdP — not this table.
-- ============================================================

create table if not exists public.aura_user_mfa (
  user_id      text        primary key,
  secret       text        not null,
  active       boolean     not null default false,
  enrolled_at  timestamptz not null default now(),
  activated_at timestamptz
);

-- @DOWN
drop table if exists public.aura_user_mfa;

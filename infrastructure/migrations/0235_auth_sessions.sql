-- ============================================================
-- AURA OS — migration 0235: session lifecycle (S2)
-- ------------------------------------------------------------
-- S1 (0233/0234) gave the platform a real credential and a
-- fully-authenticated identity, but issued only a self-contained
-- HS256 access token. There was no server-side session: logout
-- deleted a cookie, "refresh" re-minted a JWT from a JWT, and the
-- MFA challenge lived in per-node memory. Nothing the server held
-- could actually END a session.
--
-- S2 makes the session an authoritative, persistent, tenant-scoped
-- record. THREE tables, deliberately NOT merged — each is a
-- different lifetime and a different trust state:
--
--   auth_challenges      PRE-authentication state. A challenge is
--                        NOT a session: it carries no token and
--                        authorizes nothing. Persisting it (it was
--                        node-pinned in memory) is what lets a
--                        sign-in survive hitting another replica,
--                        and keeps "no MFA ⇒ no session" true across
--                        the cluster, not just one process.
--
--   auth_sessions        A session exists ONLY once every
--                        authentication requirement is satisfied.
--                        `id` IS the `sid` carried in the access
--                        token; `revoked_at` is the single switch
--                        that ends it. This is the authority the
--                        access-token boundary and every refresh
--                        consult.
--
--   auth_refresh_tokens  The long-lived half, OPAQUE and HASHED —
--                        the plaintext secret is never stored and
--                        never returned in JSON. One token is
--                        consumed EXACTLY ONCE (atomic conditional
--                        update); a second use of a spent token is
--                        a replay and revokes the whole family.
--
-- Access tokens are NOT stored here. They stay short-lived and
-- self-verifying; the authoritative state is this session/refresh
-- lifecycle. An access token is trusted only while (a) its
-- signature+exp hold AND (b) its `sid` names a live session — the
-- second check is what makes revocation bite before `exp`.
--
-- All three are FORCE ROW LEVEL SECURITY with the same strict
-- tenant predicate 0032/0233/0234 use everywhere. FORCE, not just
-- ENABLE: the owner is not exempt, so no boot path or migration can
-- read a session outside its tenant, and every caller — including
-- the seeder and the refresh transaction — must bind a tenant.
-- (These are non-`aura_`-prefixed tables, so they must also be
-- added to the RLS fitness gate's explicit coverage list alongside
-- auth_credentials — done in a companion change, not this file.)
-- ============================================================

-- ------------------------------------------------------------
-- 1. auth_challenges — pre-authentication state (persist the store)
-- ------------------------------------------------------------
create table if not exists public.auth_challenges (
  -- Opaque, high-entropy handle returned to the client. Unknown / expired / exhausted ids are
  -- all indistinguishable to a caller, so a guessed id is useless (see AuthChallengeStore).
  id                   uuid        not null default gen_random_uuid(),
  tenant_id            text        not null,
  -- mfa | password_change. A password-change challenge must never be a way around MFA — the
  -- kinds are distinct so the chain (password → MFA → password-change → session) is typed.
  kind                 text        not null,
  user_id              text        not null,
  credential_id        uuid        not null,
  -- Carried through so a completed authentication still knows to force the change.
  must_change_password boolean     not null default false,
  -- Attempts against THIS challenge (a six-digit code cannot be ground against one long-lived
  -- challenge). Separate from the persisted account lockout in auth_credentials. The store
  -- increments this ATOMICALLY (UPDATE … RETURNING) and, decisively, CONSUMES a challenge with
  -- an atomic `DELETE … WHERE (tenant_id,id)=… RETURNING`: exactly one of two concurrent correct
  -- MFA submissions can delete the row and proceed to a session; the loser gets zero rows and is
  -- denied. Consumption is single-use by construction, not by a check-then-act the two could race.
  attempts             integer     not null default 0,
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint auth_challenges_kind_check check (kind in ('mfa', 'password_change'))
);
-- Expiry policy: a challenge past expires_at is EXPIRED whether or not a row still exists. Every
-- read filters on `expires_at > now()`; a periodic reaper only reclaims space (lazy + reaper).

alter table public.auth_challenges enable row level security;
alter table public.auth_challenges force row level security;
create policy auth_challenges_tenant on public.auth_challenges
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ------------------------------------------------------------
-- 2. auth_sessions — the authoritative session; `id` is the `sid`
-- ------------------------------------------------------------
create table if not exists public.auth_sessions (
  -- This id is the `sid` claim in the access token. Revoking the row (revoked_at) invalidates
  -- every still-signature-valid access token that names it, at the verification boundary.
  id             uuid        not null default gen_random_uuid(),
  tenant_id      text        not null,
  user_id        text        not null,
  -- Which credential proved this session — survives the user being renamed/re-keyed.
  credential_id  uuid        not null,
  created_at     timestamptz not null default now(),
  -- Liveness for the IDLE timeout, updated on the refresh (COLD) path — never on every access,
  -- which would defeat the session cache. Idle-expiry is evaluated at the refresh boundary: a
  -- session that has not refreshed within its idle window is dead even though the row still
  -- exists (expired-is-expired; the reaper only reclaims space).
  last_seen_at   timestamptz,
  -- Per-session idle window override (seconds). NULL ⇒ the deployment default
  -- (AUTH_SESSION_IDLE_TIMEOUT_SECONDS). A COLUMN, not just an env var, so a stricter idle policy
  -- for Finance/Admin sessions can be set later with no schema change.
  idle_timeout_seconds integer,
  -- ABSOLUTE lifetime cap — the hard ceiling, independent of access TTL, refresh TTL, and idle.
  -- Set at creation from AUTH_SESSION_ABSOLUTE_LIFETIME_SECONDS (12h default — a configurable
  -- default, NOT hard-coded policy). Expired when now() >= expires_at, swept or not.
  expires_at     timestamptz not null,
  -- NULL = live. Set once, on logout / "sign out everywhere" / replay containment / deactivation.
  revoked_at     timestamptz,
  revoked_reason text,
  primary key (tenant_id, id)
);

alter table public.auth_sessions enable row level security;
alter table public.auth_sessions force row level security;
create policy auth_sessions_tenant on public.auth_sessions
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Boundary lookup by (tenant_id, id) is the composite PK; no extra index needed there.
-- User-scoped revocation ("sign out everywhere") scans by user.
create index if not exists auth_sessions_user_idx
  on public.auth_sessions (tenant_id, user_id);

-- ------------------------------------------------------------
-- 3. auth_refresh_tokens — opaque, hashed, single-use, family-tracked
-- ------------------------------------------------------------
create table if not exists public.auth_refresh_tokens (
  id           uuid        not null default gen_random_uuid(),
  tenant_id    text        not null,
  session_id   uuid        not null,
  -- All refresh tokens rotated from one login share a family. A replay revokes the family, not
  -- just the one token, so a captured-then-rotated token cannot be quietly reused.
  family_id    uuid        not null,
  -- sha-256 of the opaque secret. The plaintext is delivered ONLY via the HttpOnly aura_refresh
  -- cookie and is never stored, logged, or returned in JSON. Unique PER TENANT (see the unique
  -- constraint) so a hash names exactly one token within its tenant, consistent with RLS scoping.
  token_hash   text        not null,
  -- active | consumed | revoked. Rotation flips exactly ONE 'active', unexpired row to 'consumed'
  -- and RETURNs it (single-use). Zero rows returned does NOT by itself mean replay — see the
  -- classification note below; only a KNOWN, previously-consumed token triggers family containment.
  state        text        not null default 'active',
  -- The token this one was rotated into (audit trail of the chain).
  replaced_by  uuid,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint auth_refresh_tokens_state_check check (state in ('active', 'consumed', 'revoked')),
  -- Same-tenant by construction: a refresh token cannot reference a session in another tenant.
  constraint auth_refresh_tokens_session_fk
    foreign key (tenant_id, session_id) references public.auth_sessions (tenant_id, id) on delete cascade,
  constraint auth_refresh_tokens_hash_unique unique (tenant_id, token_hash)
);

alter table public.auth_refresh_tokens enable row level security;
alter table public.auth_refresh_tokens force row level security;
create policy auth_refresh_tokens_tenant on public.auth_refresh_tokens
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Refresh classification (enforced in the store; documented here so the schema's intent is
-- explicit and honest). A presented token is hashed and looked up by (tenant_id, token_hash):
--   active + unexpired  → ROTATE: atomic consume ('active'→'consumed' RETURNING) + issue the
--                         replacement in ONE transaction. Zero rows from that update means the
--                         row was not active — fall through to classify, do NOT assume replay.
--   known + consumed    → REPLAY: revoke the whole family + the session (contain, then deny).
--   known + revoked     → deny (the family is already contained).
--   known + expired     → deny.
--   unknown             → deny (an invalid/random token is NOT a replay and must not touch a family).
-- All five are externally indistinguishable (one opaque 401); the distinction is internal only.

-- Family revocation (replay containment) revokes every active row in a family in one statement.
create index if not exists auth_refresh_tokens_family_idx
  on public.auth_refresh_tokens (tenant_id, family_id);
-- All refresh tokens for a session (revoke a session ⇒ revoke its tokens).
create index if not exists auth_refresh_tokens_session_idx
  on public.auth_refresh_tokens (tenant_id, session_id);

-- @DOWN
-- Drop in dependency order: the refresh FK references sessions.
drop policy if exists auth_refresh_tokens_tenant on public.auth_refresh_tokens;
drop table if exists public.auth_refresh_tokens;
drop policy if exists auth_sessions_tenant on public.auth_sessions;
drop table if exists public.auth_sessions;
drop policy if exists auth_challenges_tenant on public.auth_challenges;
drop table if exists public.auth_challenges;

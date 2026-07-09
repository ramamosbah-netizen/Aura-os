# Runbook — Secrets: Storage, Rotation, Revocation

**Owner:** platform ops · **Established:** 2026-07-09 (gap register Vol 23 #3)

## 1. How secrets reach the app (the vault seam)

Every process secret is read through `readSecret(name)` (`shared/src/security/secret-source.ts`),
which honors the standard `<NAME>_FILE` convention: when `NAME_FILE` is set, the secret is the
content of that file; otherwise the plain env var (dev fallback). This is the integration point
for any managed store **without code changes**:

- **Docker compose / Swarm:** `secrets:` mounts land under `/run/secrets/<name>` → set
  `AUTH_JWT_SECRET_FILE=/run/secrets/auth_jwt_secret`.
- **Kubernetes:** Secret volume mounts (or external-secrets / vault CSI driver) → same pattern.
- **Azure Key Vault (recommended target, Vol 19 §4):** Key Vault + CSI driver projects vault
  secrets as files into the pod.

A set `NAME_FILE` pointing at an unreadable path **fails at boot** — explicit vault wiring never
silently degrades to running without the secret. `migrate.mjs` implements the same convention.

## 2. Secret inventory

| Secret | Consumer | Rotation impact |
|---|---|---|
| `DATABASE_URL` | kernel pg pool, `migrate.mjs` | restart required; rotate DB password provider-side first |
| `AUTH_JWT_SECRET` | token mint + verify (HS256) | rotating **invalidates all sessions** — users re-login; do it in a maintenance window or move to JWKS (Entra) where rotation is the IdP's job |
| `PII_ENCRYPTION_KEY` (+`_PREVIOUS`) | field crypto (WPS identifiers) | staged — see §3 |
| `ANTHROPIC_API_KEY` | kernel AI seam | restart; local fallback keeps the app up if absent |
| `EMBEDDINGS_API_KEY` | embedder | restart; lexical fallback |
| Supabase storage keys | DMS binary adapter | restart |
| `OTLP_HEADERS` | metrics push auth | restart |

## 3. Rotating the PII encryption key (staged, zero-downtime)

The wire format is versioned (`enc:v1:`), and decrypt accepts the current key **then**
`PII_ENCRYPTION_KEY_PREVIOUS` — so rotation is:

1. Set `PII_ENCRYPTION_KEY_PREVIOUS` = the old key, `PII_ENCRYPTION_KEY` = the new key; restart.
2. New writes now use the new key; old rows stay readable via the previous key.
3. Re-encrypt at leisure: any update to a row rewrites its encrypted fields under the new key
   (encrypt-on-write). For a forced sweep, re-save the affected records (HR employees) via API.
4. Once no `enc:v1:` rows remain under the old key, remove `PII_ENCRYPTION_KEY_PREVIOUS`.

Never rotate by simply swapping the key: without step 1 old rows fail closed (decrypt → null).

## 4. Rotation schedule & revocation

- **Schedule:** DB password + `AUTH_JWT_SECRET` + provider API keys every 90 days; PII key
  yearly or on suspicion; immediately on any suspected exposure.
- **Revoke an exposed key (the drill):**
  1. Rotate at the provider (Supabase dashboard / Anthropic console / Azure) — the old
     credential must die at the source, not just leave the config.
  2. Update the vault/secret store; restart the API (compose: `docker compose up -d api`).
  3. Audit usage of the old credential during the exposure window (provider logs, `/admin/audit`).
  4. If it was in git history: rotate **first**, then scrub history only if required — rotation
     is the fix, history rewriting is cosmetics.

## 5. Prevention

- **CI secret scanning:** the `secret-scan` (gitleaks) job fails any PR introducing a
  credential-shaped string.
- `.env*` files are gitignored and docker-ignored; compose reads real values from an
  uncommitted `.env`.
- One-time full-history audit (do once, record here):
  `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect -s /repo --log-opts="--all"`

| Date | Action | Result |
|---|---|---|
| 2026-07-09 | targeted history greps (`sk-ant-`, `service_role`, credentialed URLs) | clean (one test-string false positive) |

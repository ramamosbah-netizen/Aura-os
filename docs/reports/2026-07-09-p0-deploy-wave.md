# P0 Deploy Wave — Docker + CI Migration Gate, Secrets Vault Seam, Backup/DR Restore Drill

**Date:** 2026-07-09 · **Branch:** `claude/p1-closure-propagation-a4a701` (PR #51)
**Closes:** gap register (Vol 23) **P0 #3, #4, #5** — the sell/deploy blockers minus RLS
(#1, sequenced last by design). After this wave, **RLS is the only open register row below P2.**

---

## 1. What shipped

### #4 — Docker + deploy target + migration gate (Vol 19 §2–3)

| Artifact | What it does |
|---|---|
| `apps/api/Dockerfile` | multi-stage: `pnpm fetch` → turbo build → `pnpm deploy --prod` → non-root `node:22-alpine`. Migrations baked in — **the same image is the migration job** (`node scripts/migrate.mjs`) |
| `apps/web/Dockerfile` | Next **standalone** output; gated by `NEXT_OUTPUT=standalone` so local prod builds keep the default; `outputFileTracingRoot` = repo root for correct monorepo tracing |
| `docker-compose.yml` | single-host eval: `pgvector/pgvector:pg16` (migration 0019 needs `vector`) → **migrate** (gate) → **api** (auth ON, health-checked) → **web**. `AUTH_JWT_SECRET` from an uncommitted `.env` |
| `.dockerignore` | node_modules/dist/.next/.env* excluded from context |
| CI `deploy-readiness` | migration chain **from zero** + **idempotence rerun** (fails if anything re-applies) + builds the API and **boots it** against the migrated DB |
| CI `docker-images` | both images build on every PR; **push to GHCR on main** (`ghcr.io/<repo>/api`,`/web`, `latest`+sha) |

Supporting fix: the pg pool and the migration runner now honor `?sslmode=disable`
(service containers/compose run Postgres without SSL; Supabase behavior unchanged).

### #3 — Secrets vault + rotation + scanning (Vol 7 §10)

- **`readSecret(name)`** (`shared/src/security/secret-source.ts`): `<NAME>_FILE` convention →
  file content (Docker/K8s secret mounts, vault CSI, Azure Key Vault driver), else env.
  An explicitly set but unreadable `_FILE` **throws at boot** — vault wiring never runs open.
- Wired at **every** secret read: `DATABASE_URL` (kernel pool + `migrate.mjs`),
  `AUTH_JWT_SECRET` (auth service + bootstrap check), `ANTHROPIC_API_KEY` (AI seam),
  `PII_ENCRYPTION_KEY` (field crypto).
- **Staged PII key rotation**: `decryptField` tries the current key then
  `PII_ENCRYPTION_KEY_PREVIOUS`; writes always use the current key → switch, re-encrypt on
  write, drop the old key. (+1 test proving old rows stay readable and new writes don't need
  the old key.)
- **CI `secret-scan`** (gitleaks) fails PRs introducing credential-shaped strings.
- `docs/runbooks/secrets-rotation.md`: secret inventory, rotation windows (90 d), the
  exposed-key revocation drill, one-time full-history audit command. Targeted history greps
  (`sk-ant-`, `service_role`, credentialed URLs): clean.

### #5 — Backups/DR + restore drill (Vol 19 §8–9)

- `docs/runbooks/backup-dr.md`: **RPO ≤ 5 min** (provider PITR) / **RTO ≤ 4 h**; nightly
  portable `pg_dump -Fc`; DMS bucket versioning; restore procedure; failure scenarios
  (bad migration → `migrate.mjs down`, corruption → PITR, region loss); quarterly manual
  drill policy with a drill log.
- **The drill runs on every CI build** (in `deploy-readiness`): seed a realistic dataset
  through the live API (auth ON) → stop the API (freeze) → `pg_dump -Fc` → `pg_restore`
  into a fresh database → `apps/api/scripts/verify-restore.mjs` compares **per-table row
  counts** between source and restore; any drift or an empty source fails the pipeline.

## 2. Verification

- Local: typecheck **42/42** · shared **161** tests (secret-source +5, rotation +1) ·
  core **126** · api **30** · production `next build` **clean** (all pages dynamic, no
  prerender errors; `.next` removed afterward per the dev-server gotcha).
- CI (PR #51, run 29039857280 — **all 5 jobs green**):
  - `migration gate · boot · restore drill` **pass** (1m29s) — 136 migrations from zero,
    idempotent rerun, built API booted, seeded dataset dumped + restored + count-verified.
  - `docker images (api + web)` **pass** (3m34s) — both Dockerfiles build. (First run
    failed on tag casing only — GHCR requires lowercase; fixed with a computed namespace.)
  - `secret scan (gitleaks)` **pass** · `lint · typecheck · test · e2e` **pass** ·
    `web smoke` **pass**.

## 3. What this deliberately does not claim

- **No cloud environment was deployed.** The images, gate, and compose stack make first
  deploy a config exercise (Vol 19 §11 step 3: Azure Container Apps + Flexible PG + Key
  Vault via the `_FILE` seam) — but the Azure environment itself is not built.
- **RLS (#1)** remains open by design and should land *with* that first deploy.
- Dev-era provider keys should be **rotated** per the runbook now that the procedure exists.
- Compose runtime images are alpine non-root, not distroless; swap is a one-line change if
  the harder posture is wanted.

# 15 — DevOps & Infrastructure

## CI/CD — `VERIFIED_IMPLEMENTED` (mature)

`.github/workflows/ci.yml`, two jobs:

**`verify`** (on push to main + all PRs): `pnpm install --frozen-lockfile` → **ESLint** → **`adr:check`** (ADR registry integrity) → **migration-policy-check** (sequential, gap-free, `@DOWN` present) → **typecheck** → **`test:coverage`** (unit + module) → **API E2E** (Supertest) → **`pnpm audit --prod`** (non-blocking).

**`deploy-readiness`**: migration chain applies onto empty Postgres, is idempotent on rerun, the built API **boots** against the result; then the **restore drill** — seed real data → `pg_dump` → restore into a fresh DB → verify per-table row counts match.

This is a genuinely strong pipeline: it gates on architecture governance, schema policy, *and* a rehearsed backup/restore — the restore drill in particular is rare and valuable ("a backup that isn't rehearsed doesn't exist").

## Containerization — `VERIFIED_IMPLEMENTED`

- `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`.
- `docker-compose.yml`: `postgres` (`pgvector/pgvector:pg16`, healthcheck via `pg_isready`), a `migrate` one-shot service, plus api/web.

## Secrets & config — `VERIFIED_IMPLEMENTED` (seam)

- `readSecret` supports `*_FILE` mounts (vault/secret files) — `DATABASE_URL_FILE` etc. (`core/src/events/pg-pool.ts`).
- Env-driven posture switches: `AUTH_REQUIRED`, `ALLOW_INSECURE_NO_AUTH`, `ALLOW_RLS_BYPASS`, `IDEMPOTENCY_REQUIRED`, `WEB_AUTH_REQUIRED`, `OTLP_METRICS_URL`.

## Migrations in the deploy path — `VERIFIED_IMPLEMENTED`

- 220 sequential migrations; `MigrationGateService` degrades business routes to 503 when the DB is behind the build (`main.ts`), keeping health/metrics/docs reachable.
- `pnpm db:migrate` runs the chain.

## Gaps

| Gap | Status | Note |
|---|---|---|
| Single CI provider, no CD to environments observed | `PARTIALLY_IMPLEMENTED` | CI verifies deploy-readiness but no environment promotion/rollback pipeline found |
| No IaC (Terraform/Pulumi) for cloud infra | `MISSING` | infra is compose + Dockerfiles only |
| No blue/green or canary strategy | `MISSING` | migration gate handles schema-skew but not app rollout safety |
| Secret scanning (gitleaks) not in CI | `MISSING` | `pnpm audit` only |
| No staging/prod config in repo (by design, repo is public) | `NOT VERIFIED` | environment posture must be verified out-of-band |

## Findings

- **CI is a standout strength** — architecture + schema + restore-drill gating is above the norm for a codebase this size.
- **CD and cloud infra are unmodeled** in the repo; deployment appears manual/compose-based. Before enterprise production: add environment promotion, rollback runbooks (some exist in `docs/runbooks/`), IaC, and secret scanning.

**DevOps maturity score: 80/100.**

# Sales TIER-3 Browser / CI Release-Proof Gate

**Date:** 30 August 2026
**Scope:** existing `.github/workflows/ci.yml` TIER-3 disposable PostgreSQL + Playwright path
**Constraint:** no shared Supabase data, Sales behavior, migrations, Project or Phase 3B changes

## 1. TIER-3 job audit

The `web-smoke-postgres` job is the correct release-proof path:

- PostgreSQL service image: `pgvector/pgvector:pg16` (migration `0019` requirement).
- Fresh service container per CI job with `POSTGRES_DB=aura`.
- Separate schema-owner and least-privilege runtime credentials.
- Repository migration runner applies the complete on-disk chain from an empty database.
- `aura_environment` is marked `e2e-disposable` only after migration.
- API startup asserts `upToDate=true`, a non-null applied schema and the disposable marker.
- Playwright runs with `E2E_DISPOSABLE_DB=1` and the API URL for that service container.
- Failure artifacts include Playwright reports/results and the API log.

The workflow is triggered by `push` and `pull_request`; it has no `workflow_dispatch` trigger.

## 2. Execution attempt and blockers

The local environment cannot execute this CI job:

- Docker/`act` is not installed, so the GitHub service container cannot be reproduced locally.
- `gh` is installed but cannot read its configuration (`C:\Users\Jeet_intech\AppData\Roaming\GitHub CLI\config.yml` is inaccessible), so no authenticated run inspection or dispatch is possible.
- The workflow has no manual dispatch trigger, and no push/PR was created by this task.

The local API remains connected to the shared Supabase development database and was not used for
Browser proof. The Playwright global safety gate was exercised against it with
`E2E_DISPOSABLE_DB=1` and correctly refused the unmarked database before any spec ran.

## 3. Gate matrix

| Gate | Result | Evidence / limitation |
|---|---|---|
| pgvector availability | **PASS — configuration** | `pgvector/pgvector:pg16` is declared at `.github/workflows/ci.yml:595`; runtime image was not started locally. |
| Disposable PostgreSQL | **PASS — workflow design / NOT RUN runtime** | Fresh service container is declared; no local/CI container execution was available. |
| Migrations 271/271 | **NOT RUN** | TIER-3 workflow was not executed. Local temporary cluster stopped at migration 0019 because its unrelated PostgreSQL binary lacks pgvector. |
| API disposable marker | **NOT RUN** | Depends on the unexecuted TIER-3 job. |
| API/Web startup | **NOT RUN** | Depends on the unexecuted TIER-3 job. |
| Playwright global safety gate | **PASS — negative control** | Shared/unmarked database was refused before tests. Isolated TIER-3 positive path not run. |
| Sales browser journeys | **NOT RUN** | No Browser spec executed against disposable PostgreSQL. |
| CI job | **NOT RUN** | No local Docker runner, no authenticated GitHub CLI access, and no workflow dispatch trigger. |

## 4. Decision

```text
Browser Runtime = NOT VERIFIED
Reason = TIER-3 disposable execution unavailable from this environment
Shared Supabase = protected; no records changed
Phase 3A.4 / 3A.5 = not opened
Phase 3B / Project = unchanged and deferred
```

The repository path is ready for an actual GitHub Actions run. Once a push or pull request runs
`web-smoke-postgres`, retain the `playwright-failures-postgres` artifact and `api-pg.log`, then update
this matrix from design/NOT RUN to the actual execution results. Do not convert the configuration
audit into Browser or CI PASS without that run.

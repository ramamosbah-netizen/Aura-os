# DevOps Review

**Score: 8.5 / 10** — the CI pipeline is the standout of the entire repository: it treats correctness, isolation, and recoverability as things to *prove on every push*, not document. Loses points because CI ≠ CD: there is no live environment, deployment automation, or monitoring loop wired.

## 1. CI (`.github/workflows/ci.yml`) — exceptional

Five jobs:

| Job | What it proves |
|---|---|
| `verify` | lint · **ADR registry integrity** · **migration policy** (sequential/gap-free/@DOWN) · typecheck · unit+module tests w/ coverage · **API HTTP e2e** (Supertest) · dependency audit (non-blocking) |
| `deploy-readiness` | migration gate from zero · **idempotent rerun** (asserts "0 applied") · **RLS fitness** (every tenant table protected) · **RLS isolation** (cross-tenant denied under non-bypass role) · build+boot API against migrated DB · **SDK drift gate** · seed via live API · **R1 activation** (boots as `aura_app`, runs a real spine write, proves fail-closed + no-bypass) · **R2 deploy-gate** (un-records a migration, asserts 503 degraded + business refusal) · orphan scan · archiver smoke · **pg_dump → restore drill → row-count verify** |
| `secret-scan` | gitleaks blocks credential-shaped diffs |
| `docker-images` | builds api+web images every PR; pushes to GHCR on main (tagged `latest` + `sha`) |
| `web-smoke` | Playwright smoke against the built web app |

This is genuinely rare discipline. The RLS isolation proof and the rehearsed restore drill are things most funded teams never implement.

## 2. Containerization

- Multi-stage Dockerfiles for api + web (`apps/api/Dockerfile`, `apps/web/Dockerfile`).
- `docker-compose.yml`: postgres (pgvector) → **migration gate** service → api (health-gated) → web. Correct dependency ordering; secrets via `.env` with fail-fast (`AUTH_JWT_SECRET:?`).
- Single-host evaluation stack works out of the box.

## 3. Observability

- **Metrics:** OTLP push + Prometheus `/metrics` endpoint; low-cardinality HTTP metrics (`apps/api/src/main.ts`, `apps/api/src/observability/metrics.controller.ts`).
- **Alerts:** `infrastructure/observability/prometheus-alerts.yml` exists.
- **Health:** `/api/v1/health` with schema-drift degradation (503).
- **Audit:** audit service + table.
- **Gap:** these are *emitters and definitions* — there is no evidence of a running Prometheus/Grafana/alertmanager, log aggregation, tracing backend, or alert routing (PagerDuty/Slack). Observability is instrumented but not operationalized.

## 4. What's missing for production (the CD half)

| Gap | Impact |
|---|---|
| **No CD pipeline** | images build but nothing deploys them anywhere; no staging/prod environments defined as code |
| **No IaC** | no Terraform/Pulumi/K8s manifests for the runtime (Supabase is managed, but the API/web hosting is undefined) |
| **No monitoring stack running** | alerts/metrics have no home; no dashboards, no on-call |
| **No log aggregation / tracing backend** | OTLP is pushed but to where? confirm a collector |
| **No blue/green or migration-in-prod story** | the migration gate is great; the *prod* migration execution + rollback runbook needs to be exercised live |
| **CORS wide open** (`app.enableCors()` no allowlist) | tighten per-environment |
| **No helmet / security headers** | add for the web-facing API |

## 5. Runbooks & governance

- `docs/runbooks/` exists (secrets rotation referenced). ADR tooling is CI-gated. Migration policy enforced. This is strong operational governance for pre-production.

## Recommendations (ranked)

1. **Stand up a real staging environment** and a **CD pipeline** (deploy the GHCR images on merge to main).
2. **Operationalize observability:** run Prometheus+Grafana+alertmanager (or a hosted equivalent), wire OTLP to a collector, route alerts to a channel.
3. **Author + rehearse the production migration & rollback runbook** (the CI gate proves the mechanism; prod needs the procedure).
4. **Add IaC** for the API/web hosting tier.
5. **Per-environment CORS allowlist + helmet/security headers.**
6. **Make dependency audit blocking** above a severity threshold; add Dependabot/Renovate.

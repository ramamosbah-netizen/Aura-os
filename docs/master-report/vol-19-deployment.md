# Volume 19 — Deployment

[← Master index](README.md)

**Honest status: 60% (score 6.3, re-scored 2026-07-09)** — packaging, the CI migration gate,
observability, and backup/DR are **built and rehearsed**; what remains is the first actual
cloud target (Azure §4) and the P2 operations depth (traces, central logging, K8s). This
volume records today's runtime and the target reference architecture as the build contract.

---

## 1. Today's runtime (dev/demo)

API (Nest, :4200, `PORT`/`AUTH_JWT_SECRET`/`DEMO_SEED`) · web (Next dev, :3200,
`AURA_API_URL`) · Postgres via Supabase (or none — full in-memory mode) · migrations via
`pnpm db:migrate` (duplicate-guarded runner).

**Environment matrix (the de-facto config contract):**

| Var | Purpose |
|---|---|
| `PG_POOL` / DB URL | Postgres on/off (adapter swap) |
| `AUTH_REQUIRED`, `AUTH_JWT_SECRET`, `AUTH_DEV_PASSWORD` | auth gate (Vol 7 §1) |
| `DEMO_SEED` | demo dataset |
| `AURA_API_URL`, `NEXT_PUBLIC_API_URL` | web→API wiring |
| AI provider key/model | Claude on; absent = local fallback |
| Supabase storage keys | DMS binary adapter |

Every secret-bearing var also accepts the `<NAME>_FILE` convention (vault/secret-mount
seam, 2026-07-09 — see Vol 7 §10 and `docs/runbooks/secrets-rotation.md`).

## 2. Docker — ✅ DONE 2026-07-09 (gap #4 closed)

Shipped exactly per the contract:
- **`apps/api/Dockerfile`** — multi-stage: pnpm fetch → turbo build → `pnpm deploy` →
  non-root `node:22-alpine` runtime. The **same image is the migrations job**
  (`node scripts/migrate.mjs`; migrations baked in at `/app/infrastructure/migrations`).
- **`apps/web/Dockerfile`** — Next standalone output (gated by `NEXT_OUTPUT=standalone`
  so local prod builds keep the default; `outputFileTracingRoot` = repo root).
- **`docker-compose.yml`** — single-host evaluation: `pgvector/pgvector:pg16` (migration
  0019 needs the vector extension) → **migration gate** (api/web start only after the
  chain applies cleanly) → api (auth ON, health-checked) → web.
- **CI**: `deploy-readiness` job proves the full migration chain from zero + idempotent
  rerun + the built API boots against the result, on every PR. `docker-images` builds
  both images per PR and **publishes to GHCR on main** (`api`/`web`, `latest` + sha).

## 3. Kubernetes [Planned]

Reference: Deployments (api ×n, web ×n) + HPA · migrations as pre-deploy Job (gate) ·
Ingress + TLS · secrets via CSI/external-secrets (Vol 7 §10) · pgBouncer sidecar/service ·
outbox relay runs in-process (SKIP LOCKED makes replicas safe — no singleton needed) ·
background jobs need leader election or a queue before >1 replica [known constraint].

## 4. Azure (recommended first target — GCC data residency: UAE North)

AKS or Container Apps · Azure Database for PostgreSQL Flexible · Blob storage (DMS adapter
port makes this one file) · Key Vault · Entra ID for SSO (Vol 7 §8) · Front Door + WAF ·
Azure Monitor.

## 5. AWS / GCP (equivalents)

ECS-Fargate/EKS + RDS + S3 + Secrets Manager + CloudFront | Cloud Run/GKE + Cloud SQL + GCS +
Secret Manager. No cloud-specific code exists anywhere — the ports keep it that way.

## 6. Monitoring — ✅ DONE 2026-07-08 (gap #6 closed)

Shipped (dependency-free, no OTel SDK):
- **Prometheus scrape**: `GET /api/v1/metrics` (text exposition, gated by `METRICS_ENABLED`)
  — `outbox_pending` / `outbox_dead_letter` gauges refreshed from the DB at scrape time;
  `jobs_processed_total`, `webhook_deliveries_total`, `http_requests_total` +
  `http_request_duration_ms_sum/_count` (method/status-class labels, low-cardinality).
- **OTLP/HTTP push** (opt-in): `OTLP_METRICS_URL` / `OTLP_EXPORT_INTERVAL_MS` /
  `OTLP_HEADERS` / `OTLP_SERVICE_NAME` — counters export as monotonic cumulative sums;
  outbox gauges refresh before each push.
- **Alert pack**: `infrastructure/observability/prometheus-alerts.yml` (dead-letters,
  outbox backlog, webhook failure rate, 5xx ratio >2%, mean latency >750ms, job failures)
  + `infrastructure/observability/README.md` (runbook + metric catalog).

Remaining (P2): distributed traces (HTTP + pg + relay spans) and hosted dashboards.

## 7. Logging

Today: Nest logger + correlation id. Target: structured JSON, request/tenant/actor fields,
central aggregation (Loki/ELK), PII scrubbing [P2].

## 8. Backup — ✅ DONE 2026-07-09 (gap #5 closed)

`docs/runbooks/backup-dr.md`: RPO ≤ 5 min (provider PITR) / RTO ≤ 4 h documented, nightly
portable `pg_dump -Fc` as the secondary path, storage-bucket versioning for DMS, secrets
excluded from dumps (they live in the vault seam).

## 9. Recovery — ✅ DONE 2026-07-09 (gap #5 closed)

The runbook covers DB restore (PITR and dump paths), post-restore verification, dead-letter
replay via `/admin/health`, webhook auto-redelivery, and failure scenarios (bad migration →
`migrate.mjs down`, region loss). **The drill is automated**: every CI run seeds a real
dataset through the live API, dumps, restores into a fresh database, and fails unless
per-table row counts match (`apps/api/scripts/verify-restore.mjs`). Quarterly manual drill
against *production* dumps is policy, with a drill log in the runbook.

## 10. Scaling

Documented posture (Volume 2 §11): stateless API scales horizontally now; relay is
replica-safe; jobs need queue/leader-election; pgBouncer before >2 API replicas; read
replicas + partitioning (Vol 8 §7) when volume demands.

## 11. Sequencing (deployment epic)

1. ~~Dockerfiles + compose~~ ✅ → 2. ~~CI publishes images + migration gate~~ ✅ →
3. single-region Azure (Container Apps + Flexible PG + Key Vault via the `_FILE` seam) with
auth ON and the RLS bundle (the last Vol 7 P0 lands *with* first deploy) →
4. ~~metrics/alerts~~ ✅ → 5. ~~backup/DR runbooks + restore drill~~ ✅ →
6. K8s only when scale demands. **The epic's remaining step is #3 — everything around it
is built.**

---

*Next: [Volume 20 — Product Roadmap](vol-20-roadmap.md)*

# Volume 19 — Deployment

[← Master index](README.md)

**Honest status: 25% (score 3.5)** — the app is architecturally deploy-ready (stateless API,
dual-runtime, migrations, CI) but packaging, orchestration, and operations are unbuilt. This
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

## 2. Docker [Gap — P0]

Contract: multi-stage Dockerfiles (`apps/api`, `apps/web`) — pnpm fetch → turbo build →
distroless runtime; a migrations job image (same runner); compose file for single-host
evaluation (api + web + postgres + storage). Images are the prerequisite for every target
below.

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

## 6. Monitoring [Gap — P1]

Target: OpenTelemetry traces (HTTP + pg + event relay spans) · Prometheus metrics — the four
platform-specific gauges: **outbox lag, dead-letter depth, webhook failure rate, job queue
age** · dashboards + alerts. `/health` endpoint exists as the seed.

## 7. Logging

Today: Nest logger + correlation id. Target: structured JSON, request/tenant/actor fields,
central aggregation (Loki/ELK), PII scrubbing [P2].

## 8. Backup

Today: Supabase defaults, **undocumented** [P0 item]. Target: PITR enabled + documented RPO
(≤5 min) / RTO (≤4 h) + storage-bucket versioning for DMS.

## 9. Recovery

[Gap]: written runbooks — DB restore, dead-letter replay (data + tooling exist), webhook
redelivery, partial-region failover. **Quarterly restore test** as policy; recovery that isn't
rehearsed doesn't exist.

## 10. Scaling

Documented posture (Volume 2 §11): stateless API scales horizontally now; relay is
replica-safe; jobs need queue/leader-election; pgBouncer before >2 API replicas; read
replicas + partitioning (Vol 8 §7) when volume demands.

## 11. Sequencing (deployment epic)

1. Dockerfiles + compose → 2. CI publishes images + migration gate → 3. single-region Azure
(Container Apps + Flexible PG + Key Vault) with auth ON and RLS bundle (the Vol 7 P0s land
*with* first deploy) → 4. OTel/metrics/alerts → 5. backup/DR runbooks + restore drill →
6. K8s only when scale demands.

---

*Next: [Volume 20 — Product Roadmap](vol-20-roadmap.md)*

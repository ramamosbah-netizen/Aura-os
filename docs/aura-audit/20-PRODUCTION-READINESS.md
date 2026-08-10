# 20 — Production Readiness

## Scoring methodology

Each dimension scored 0–100 from **repository evidence only**. Weights reflect enterprise-ERP go-live risk (security, tenancy, data integrity, and workflow correctness weigh more than documentation). Overall = weighted mean. Scores are **conservative**: unverifiable-positive claims are *not* counted as full credit (they cap the dimension), per the audit's skeptical mandate.

| Dimension | Weight | Score | Weighted | Basis (doc) |
|---|--:|--:|--:|---|
| Architecture | 10 | 86 | 8.60 | `01` |
| Backend | 8 | 80 | 6.40 | `01`,`05` |
| Frontend | 7 | 64 | 4.48 | `06` |
| Database | 9 | 84 | 7.56 | `04` |
| Security | 12 | 71 | 8.52 | `07` |
| Multi-tenancy | 10 | 83 | 8.30 | `08` |
| ERP functionality | 8 | 66 | 5.28 | `09`–`12` |
| Workflow integrity | 7 | 72 | 5.04 | `03` |
| Testing | 8 | 62 | 4.96 | `14` |
| DevOps | 5 | 80 | 4.00 | `15` |
| Observability | 4 | 70 | 2.80 | below |
| Performance | 5 | 52 | 2.60 | `16` |
| UX | 3 | 62 | 1.86 | `06` |
| Data integrity | 3 | 74 | 2.22 | `04` |
| Documentation | 1 | 80 | 0.80 | ADRs/reports |
| **Total** | **100** | — | **73.4** | |

**Reported overall: ~68/100.** The weighted arithmetic yields **73**, adjusted **down to ~68** by a **production-gate penalty**: the three P0 blockers (unverified prod RLS, config-gated auth, no UI E2E) are *go/no-go* conditions whose failure would invalidate the higher architecture/tenancy scores in practice. Until they are closed, effective readiness is below the component average.

## Observability (scored here) — 70/100

`VERIFIED_IMPLEMENTED`: HTTP metrics (`http_requests_total`, duration sum/count) at `/metrics`, OTLP push (`OtlpMetricsPusher`), outbox gauges (`outbox_pending`, `outbox_dead_letter`), correlation IDs on every response, health + migration-gate endpoints. `MISSING/UNVERIFIED`: distributed tracing spans, structured log shipping/aggregation, alerting rules.

## Go / No-Go checklist

| Gate | State | Blocker |
|---|---|---|
| Prod DB runs as NOBYPASSRLS `aura_app`, FORCE RLS | **NOT VERIFIED** | **P0 (G-01)** |
| Prod has auth verifier + `AUTH_REQUIRED=true` | **NOT VERIFIED** | **P0 (G-02)** |
| Browser smoke E2E on spine journeys | **MISSING** | **P0 (G-03)** |
| Rate limiting + CORS allowlist | **MISSING** | P1 (G-07) |
| Error-state semantics fixed | **OPEN** | P1 (G-05) |
| Backup/restore rehearsed | **DONE** (CI restore drill) | ✅ |
| Migration deploy-gate | **DONE** | ✅ |
| Fail-closed auth/RLS bootstrap | **DONE** | ✅ |

## Verdict

**Not production-ready for enterprise customers today — but close, and blocked mostly on *operational verification* rather than missing architecture.** Close the 3 P0s and the platform is defensible for a controlled pilot; add the P1 hardening for general availability.

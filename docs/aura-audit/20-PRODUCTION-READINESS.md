# 20 — Production Readiness

## Scoring methodology

Each dimension scored 0–100 from **repository evidence only**. Weights reflect enterprise-ERP go-live risk (security, tenancy, data integrity, and workflow correctness weigh more than documentation). Overall = weighted mean. Scores are **conservative**: unverifiable-positive claims are *not* counted as full credit (they cap the dimension), per the audit's skeptical mandate.

| Dimension | Weight | Rev 1 | Rev 1 wtd | **Rev 2** | **Rev 2 wtd** | Basis (doc) |
|---|--:|--:|--:|--:|--:|---|
| Architecture | 10 | 86 | 8.60 | 86 | 8.60 | `01` |
| Backend | 8 | 80 | 6.40 | 80 | 6.40 | `01`,`05` |
| Frontend | 7 | 64 | 4.48 | **68** | **4.76** | `06` |
| Database | 9 | 84 | 7.56 | 84 | 7.56 | `04` |
| Security | 12 | 71 | 8.52 | **74** | **8.88** | `07` |
| Multi-tenancy | 10 | 83 | 8.30 | 83 | 8.30 | `08` |
| ERP functionality | 8 | 66 | 5.28 | **72** | **5.76** | `09`–`12` |
| Workflow integrity | 7 | 72 | 5.04 | **75** | **5.25** | `03` |
| Testing | 8 | 62 | 4.96 | **68** | **5.44** | `14` |
| DevOps | 5 | 80 | 4.00 | 80 | 4.00 | `15` |
| Observability | 4 | 70 | 2.80 | 70 | 2.80 | below |
| Performance | 5 | 52 | 2.60 | 52 | 2.60 | `16` |
| UX | 3 | 62 | 1.86 | **66** | **1.98** | `06` |
| Data integrity | 3 | 74 | 2.22 | **76** | **2.28** | `04` |
| Documentation | 1 | 80 | 0.80 | 80 | 0.80 | ADRs/reports |
| **Total** | **100** | — | **73.4** | — | **75.4** | |

**Reported overall: ~68/100 — unchanged at Rev 2.** The weighted arithmetic yields **73.4 at Rev 1 and 75.4 at Rev 2**, adjusted **down to ~68** by a **production-gate penalty**: the three P0 blockers (unverified prod RLS, config-gated auth, no spine UI E2E) are *go/no-go* conditions whose failure would invalidate the higher architecture/tenancy scores in practice. Until they are closed, effective readiness is below the component average.

> **Why the headline did not move.** All three P0s remain open at Rev 2 — nothing in PRs #205–#209 touches RLS or auth posture, and the browser-E2E blocker was advanced (1→10 specs) but not cleared, because the spine journey it names is still uncovered (`18` G-03). A gate is binary: partial progress against it does not release the penalty.
>
> **Rev 2 dimension scores are re-estimates from merged source**, on the same design-review basis as Rev 1 — **not a live benchmark run**. Per this audit's method, no score here should be read as a measured runtime result.

## Observability (scored here) — 70/100

`VERIFIED_IMPLEMENTED`: HTTP metrics (`http_requests_total`, duration sum/count) at `/metrics`, OTLP push (`OtlpMetricsPusher`), outbox gauges (`outbox_pending`, `outbox_dead_letter`), correlation IDs on every response, health + migration-gate endpoints. `MISSING/UNVERIFIED`: distributed tracing spans, structured log shipping/aggregation, alerting rules.

## Go / No-Go checklist

| Gate | State | Blocker |
|---|---|---|
| Prod DB runs as NOBYPASSRLS `aura_app`, FORCE RLS | **NOT VERIFIED** (unchanged) | **P0 (G-01)** |
| Prod has auth verifier + `AUTH_REQUIRED=true` | **NOT VERIFIED** (unchanged) | **P0 (G-02)** |
| Browser smoke E2E **on spine journeys** | **MISSING** — 10 browser specs exist, none covers the spine | **P0 (G-03)** |
| ▲ Browser E2E on delivery-half workflows | **DONE** (Rev 2 — 5 specs, CI runs them against a live API) | ✅ |
| ▲ Delivery-half completable in-app journeys | **DONE** (Rev 2 — PRs #205–#209) | ✅ |
| ▲ Rate limiting + CORS allowlist | **DONE** (Rev 2) — `EdgeRateLimitGuard` is a global guard (`main.ts:59-60`); `resolveCors` enforces a `CORS_ALLOWED_ORIGINS` allowlist (`main.ts:55-57`). *Per-env value still ops state* | ✅ (G-07 closed) |
| Error-state semantics fixed | **OPEN** (unchanged) | P1 (G-05) |
| Backup/restore rehearsed | **DONE** (CI restore drill) | ✅ |
| Migration deploy-gate | **DONE** | ✅ |
| Fail-closed auth/RLS bootstrap | **DONE** | ✅ |

## Verdict

**Not production-ready for enterprise customers today — but close, and blocked mostly on *operational verification* rather than missing architecture.** Close the 3 P0s and the platform is defensible for a controlled pilot; add the P1 hardening for general availability.

**Rev 2 addendum.** The verdict is unchanged, but the *shape* of the remaining work has shifted. At Rev 1 the residual risk was two-sided: operational posture **plus** a delivery half that could not be run in the product. The second half of that is now largely retired — engineering, doc-control, QA/QC, site and commissioning are governed, surfaced and E2E-covered. What remains is almost entirely **operational verification** (G-01, G-02) plus **one well-scoped test deliverable** (a spine browser suite, for which a working template and a CI harness now exist). That is a materially cheaper path to the gate than Rev 1 implied, even though the score is deliberately identical.

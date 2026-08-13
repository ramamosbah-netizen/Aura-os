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
| ERP functionality | 8 | 66 | 5.28 | **76** | **6.08** | `09`–`12` |
| Workflow integrity | 7 | 72 | 5.04 | **75** | **5.25** | `03` |
| Testing | 8 | 62 | 4.96 | **76** ᴿ²·⁵ | **6.08** | `14` |
| DevOps | 5 | 80 | 4.00 | 80 | 4.00 | `15` |
| Observability | 4 | 70 | 2.80 | 70 | 2.80 | below |
| Performance | 5 | 52 | 2.60 | 52 | 2.60 | `16` |
| UX | 3 | 62 | 1.86 | **66** | **1.98** | `06` |
| Data integrity | 3 | 74 | 2.22 | **76** | **2.28** | `04` |
| Documentation | 1 | 80 | 0.80 | 80 | 0.80 | ADRs/reports |
| **Total** | **100** | — | **73.4** | — | **76.4** | |

**Reported overall: ~68/100 — unchanged through Rev 2.5.** The weighted arithmetic yields **73.4 at Rev 1 and 76.4 at Rev 2.5**, adjusted **down to ~68** by a **production-gate penalty**: the P0 blockers are *go/no-go* conditions whose failure would invalidate the higher architecture/tenancy scores in practice. **Two remain** (G-01 prod RLS posture, G-02 auth configuration), both runtime/ops state. Until they are proven, effective readiness stays below the component average.

> **Why the headline still did not move — and what changed underneath it.** G-03 is **closed** at Rev 2.5: the suite signs in and drives the spine authenticated. That is the first P0 to fall, and it takes the count from 3 to 2. The headline holds anyway, because a gate is binary and **G-01 and G-02 are still unproven** — and neither can be settled from the repository. They are assertions about *your environments*: that production connects as a `NOBYPASSRLS` role with FORCE RLS, and that a real verifier is configured with `AUTH_REQUIRED=true`.
>
> The shape of the remaining work is therefore now **entirely operational**. Nothing further in this codebase moves the readiness number.
>
> **ᴿ²·⁵ The Testing score is the one figure here backed by an executed run** — 41 browser tests passing locally, twice, against an auth-enabled API (`14`) — rather than a design-review estimate.
>
> **Rev 2 dimension scores are re-estimates from merged source**, on the same design-review basis as Rev 1 — **not a live benchmark run**. Per this audit's method, no score here should be read as a measured runtime result.

## Observability (scored here) — 70/100

`VERIFIED_IMPLEMENTED`: HTTP metrics (`http_requests_total`, duration sum/count) at `/metrics`, OTLP push (`OtlpMetricsPusher`), outbox gauges (`outbox_pending`, `outbox_dead_letter`), correlation IDs on every response, health + migration-gate endpoints. `MISSING/UNVERIFIED`: distributed tracing spans, structured log shipping/aggregation, alerting rules.

## Go / No-Go checklist

| Gate | State | Blocker |
|---|---|---|
| Prod DB runs as NOBYPASSRLS `aura_app`, FORCE RLS | **NOT VERIFIED** (unchanged) | **P0 (G-01)** |
| Prod has auth verifier + `AUTH_REQUIRED=true` | **NOT VERIFIED** (unchanged) | **P0 (G-02)** |
| ▲▲ Browser smoke E2E **on spine journeys** | **DONE (Rev 2.5)** — the suite signs in through the real login form, then creates and reads back all six spine records **authenticated**. 41 passed / 0 failed, twice, on a cold server. CI fails the job if auth did not engage | ✅ (G-03 closed) |
| ▲ Browser E2E on delivery-half workflows | **DONE** (Rev 2 — 5 specs, CI runs them against a live API) | ✅ |
| ▲ Delivery-half completable in-app journeys | **DONE** (Rev 2 — PRs #205–#209; extended to HSE at Rev 2.2 and amc/assets/fleet at Rev 2.3 — **G-08 closed**) | ✅ |
| ▲ Rate limiting + CORS allowlist | **DONE** (Rev 2) — `EdgeRateLimitGuard` is a global guard (`main.ts:59-60`); `resolveCors` enforces a `CORS_ALLOWED_ORIGINS` allowlist (`main.ts:55-57`). *Per-env value still ops state* | ✅ (G-07 closed) |
| Error-state semantics fixed | **OPEN** (unchanged) | P1 (G-05) |
| Backup/restore rehearsed | **DONE** (CI restore drill) | ✅ |
| Migration deploy-gate | **DONE** | ✅ |
| Fail-closed auth/RLS bootstrap | **DONE** | ✅ |

## Verdict

**Not production-ready for enterprise customers today — but the remaining distance is now entirely *operational verification*, not missing architecture or missing evidence.** Close the **2** remaining P0s and the platform is defensible for a controlled pilot; add the P1 hardening for general availability.

**Rev 2 addendum.** The verdict is unchanged, but the *shape* of the remaining work has shifted. At Rev 1 the residual risk was two-sided: operational posture **plus** a delivery half that could not be run in the product. The second half of that is now largely retired — engineering, doc-control, QA/QC, site and commissioning are governed, surfaced and E2E-covered. What remains is **only operational verification** (G-01, G-02). The test deliverable this addendum once described as outstanding — the spine browser suite — is done and running authenticated (`14`).

**Rev 2.5 addendum.** With G-03 closed, *every P0 that a repository change could close is closed*. The two survivors are assertions about environments the repo cannot inspect: prove the production database runs under a `NOBYPASSRLS` role with FORCE RLS, and prove a real verifier is configured with `AUTH_REQUIRED=true`. Both are S-effort ops actions with an explicit boot-time gate already waiting for them. **No further code in this repository will move the readiness number.**

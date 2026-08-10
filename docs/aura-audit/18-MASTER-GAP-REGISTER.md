# 18 — Master Gap Register

Severity: **P0** production blocker · **P1** critical · **P2** important · **P3** improvement · **P4** future.

| ID | Domain | Gap | Evidence | Sev | Business impact | Security impact | Technical impact | Recommendation | Effort | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| G-01 | Tenancy/Sec | Prod/staging RLS least-privilege posture unverified | `main.ts` RLS gate; `0163/0164`; runtime not inspectable | **P0** | Cross-tenant data exposure if RLS inert | Critical | Isolation rests on app layer only | Prove `aura_app` NOBYPASSRLS + FORCE RLS on every non-dev env; log posture at boot | S (ops) | P0 |
| G-02 | Security | AuthZ inert until verifier configured | `permissions.guard.ts:100` | **P0** | Unauthenticated access if misconfigured | Critical | — | Configure `AUTH_JWKS_URL`/secret + `AUTH_REQUIRED` in prod; verify boot-fatal gate | S (ops) | P0 |
| G-03 | QA | No browser E2E regression net (1 smoke spec) | `apps/web/e2e` | **P0** | Undetected UI journey breakage | Med | Regressions ship silently | Spine smoke suite (login→create/read each spine entity) | M | P0 |
| G-04 | Perf | Global search in-memory fan-out | `search.service.ts` | **P1** | Slow/failing search at scale | Low | O(all rows)/query | Replace with FTS/projection index | M | P1 |
| G-05 | Frontend | `getJson` masks all errors as empty | `apps/web/lib/api.ts` | **P1** | Users can't distinguish empty vs error vs denied | Med (hides 403) | — | Distinguish auth/error/empty states | S | P1 |
| G-06 | Data | Thin DB FKs (54/198 tables) | migrations | **P1** | Orphaned/inconsistent records | Low | Integrity app-only | Orphan-scan CI gate over all spine parents; add intra-module FKs | M | P1 |
| G-07 | Security | No rate limiting; permissive CORS | `main.ts` | **P1** | Brute force / abuse | High | — | Add throttler + CORS allowlist | S | P1 |
| G-08 | Delivery UX | Back-half modules lack completable UI journeys | `02`,`10`,`11` | **P1** | Can't run engineering/site/QA/commissioning in-app | Low | — | Build workflow UIs on existing data models | L | P1 |
| G-09 | Perf | No caching; pagination not enforced | `16` | **P1** | Latency/cost at scale | Low | Recompute/unbounded lists | Cache aggregations; enforce pagination via fitness rule | M | P1 |
| G-10 | Finance | Money as float (`toFixed(2)`) | `wbs.ts`, aging | **P1** | Rounding drift in ledgers | Low | — | Introduce decimal money type | M | P1 |
| G-11 | Ops | No dead-letter/outbox operator UI | `13` | **P1** | Silent reactor failures | Med | — | Admin UI to inspect/replay dead events | M | P1 |
| G-12 | Inventory | Batch/lot, reservations, valuation method unverified | `12` | **P1** | Stock accuracy/valuation gaps | Low | — | Verify/implement lot tracking + valuation | M | P1 |
| G-13 | Notifications | Multi-channel delivery (email/SMS/push) not verified wired | `13`,`23` | **P2** | Users miss alerts | Low | — | Verify/complete provider integrations | M | P2 |
| G-14 | QA | Coverage floor not gated; back-half API E2E missing | `14` | **P2** | Regressions slip | Low | — | Coverage gate + back-half E2E | M | P2 |
| G-15 | DevOps | No CD/IaC/rollout strategy; no secret scanning | `15` | **P2** | Risky/manual deploys | Med | — | IaC + promotion pipeline + gitleaks | M | P2 |
| G-16 | Observability | No tracing spans; logs not verified structured/aggregated | `19`,below | **P2** | Slow incident diagnosis | Low | — | Add OTLP traces; ship structured logs | M | P2 |
| G-17 | i18n/Region | No i18n; data residency single-region | `08` | **P3** | Limits non-English/regulated markets | Low | — | Add i18n framework; plan residency | L | P3 |
| G-18 | Field Service | No PWA/offline/mobile worker journey | `11` | **P3** | No field ops | Low | — | Build FSM/PWA if in scope | L | P3 |
| G-19 | Repo | `dist/` committed in modules | `17` | **P3** | Drift/bloat | Low | — | Build in CI, gitignore dist | S | P3 |
| G-20 | Security | Upload MIME/size/AV + signed URLs unverified | `07` | **P2** | Malicious upload / data leak | Med | — | Verify DMS validation + signed access | M | P2 |

**Totals:** P0 = 3 · P1 = 9 · P2 = 5 · P3 = 3.

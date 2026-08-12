# 18 — Master Gap Register

Severity: **P0** production blocker · **P1** critical · **P2** important · **P3** improvement · **P4** future.

> **Rev 2 (2026-08-12, commit `1a14a036`).** Statuses below are updated from **merged code on `main`** (PRs #205–#209), per the audit's rule that gap status may move on merged evidence while *scores* require a live run. Changed rows are marked **▲**. Three gaps moved: **G-08** largely closed and downgraded, **G-14** partially closed, **G-03** materially advanced **but still P0**.

| ID | Domain | Gap | Evidence | Sev | Business impact | Security impact | Technical impact | Recommendation | Effort | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| G-01 | Tenancy/Sec | Prod/staging RLS least-privilege posture unverified | `main.ts` RLS gate; `0163/0164`; runtime not inspectable | **P0** | Cross-tenant data exposure if RLS inert | Critical | Isolation rests on app layer only | Prove `aura_app` NOBYPASSRLS + FORCE RLS on every non-dev env; log posture at boot | S (ops) | P0 |
| G-02 | Security | AuthZ inert until verifier configured | `permissions.guard.ts:100` | **P0** | Unauthenticated access if misconfigured | Critical | — | Configure `AUTH_JWKS_URL`/secret + `AUTH_REQUIRED` in prod; verify boot-fatal gate | S (ops) | P0 |
| ▲▲ G-03 | QA | **Spine coverage DELIVERED (Rev 2.1, commit `dee209bc`).** `spine-journey.spec.ts` creates **and reads back through the real UI** all six spine records — account, opportunity, quotation, contract, project, invoice. Browser specs 10→11; suite 27→34 passing. Fails (not skips) under CI when the API is unreachable. **Residual: the `login →` leg of the acceptance is NOT met** — see note below | `apps/web/e2e/spine-journey.spec.ts`; `ci.yml` `web-smoke` | **P0** *(gate not released)* | Spine UI regressions are now caught | Med | — | Seed a dev admin grant (or equivalent) so an **authenticated** spine run is possible, then close. Coupled to **G-02** | S | P0 |
| G-04 | Perf | Global search in-memory fan-out | `search.service.ts` | **P1** | Slow/failing search at scale | Low | O(all rows)/query | Replace with FTS/projection index | M | P1 |
| G-05 | Frontend | `getJson` masks all errors as empty | `apps/web/lib/api.ts` | **P1** | Users can't distinguish empty vs error vs denied | Med (hides 403) | — | Distinguish auth/error/empty states | S | P1 |
| G-06 | Data | Thin DB FKs (62/218 tables @ Rev 2; ratio unchanged) | migrations | **P1** | Orphaned/inconsistent records | Low | Integrity app-only | Orphan-scan CI gate over all spine parents; add intra-module FKs | M | P1 |
| ▲ G-07 | Security | **CLOSED (Rev 2).** `EdgeRateLimitGuard` is registered as a **global guard** (`main.ts:59-60`); `resolveCors` enforces a `CORS_ALLOWED_ORIGINS` allowlist with a production warning path (`main.ts:55-57`); CSP headers per route (`cspFor`) and a request body cap (`BODY_LIMIT`) also landed | `core/src/http/edge-security.ts`, `core/src/http/rate-limit.guard.ts` (+ tests); wired in `apps/api/src/main.ts` | ~~P1~~ **CLOSED** | Brute-force/abuse surface closed at the edge | High → addressed | — | **Verify the production `CORS_ALLOWED_ORIGINS` value is set** — the allowlist mechanism exists but its per-env value is ops state (`NOT VERIFIED`, same class as G-01/G-02) | done | — |
| ▲▲ G-08 | Delivery UX | **CLOSED for every safety- or delivery-critical module (Rev 2.2).** Engineering, doc-control, QA/QC, site, commissioning (PRs #205–#209) **and now HSE** (mig `0229`) each have an enforced state machine + a completable in-app journey + browser E2E. **Residual:** fleet, assets, amc — asset registers, not safety controls | `02`,`10`,`11`; `drawing.ts:30`, `ncr.ts:19`, `document-revision.ts:26`, `daily-report.ts:19`, `commissioning.service.ts:78`, `permit-to-work.ts:30` | ~~P2~~ **P3** | The whole delivery half is now runnable in-app | Low | — | **Remaining:** fleet/assets/amc lifecycle depth — worth doing, not blocking | S | P3 |
| G-09 | Perf | No caching; pagination not enforced | `16` | **P1** | Latency/cost at scale | Low | Recompute/unbounded lists | Cache aggregations; enforce pagination via fitness rule | M | P1 |
| G-10 | Finance | Money as float (`toFixed(2)`) | `wbs.ts`, aging | **P1** | Rounding drift in ledgers | Low | — | Introduce decimal money type | M | P1 |
| G-11 | Ops | No dead-letter/outbox operator UI | `13` | **P1** | Silent reactor failures | Med | — | Admin UI to inspect/replay dead events | M | P1 |
| G-12 | Inventory | Batch/lot, reservations, valuation method unverified | `12` | **P1** | Stock accuracy/valuation gaps | Low | — | Verify/implement lot tracking + valuation | M | P1 |
| G-13 | Notifications | Multi-channel delivery (email/SMS/push) not verified wired | `13`,`23` | **P2** | Users miss alerts | Low | — | Verify/complete provider integrations | M | P2 |
| ▲ G-14 | QA | **PARTIALLY CLOSED.** API E2E rose 33→41, adding back-half specs for engineering, quality, doccontrol, site and commissioning (plus compliance, ELV devices, RBAC tenant isolation). **Coverage floor still not gated**; hse/fleet/assets/amc still lack API E2E | `14`; `apps/api/test/*.e2e-spec.ts` | **P2** | Regressions slip in ungated areas | Low | — | Set the coverage floor gate in CI; extend E2E to the four remaining CRUD modules | S–M (was M) | P2 |
| G-15 | DevOps | No CD/IaC/rollout strategy; no secret scanning | `15` | **P2** | Risky/manual deploys | Med | — | IaC + promotion pipeline + gitleaks | M | P2 |
| G-16 | Observability | No tracing spans; logs not verified structured/aggregated | `19`,below | **P2** | Slow incident diagnosis | Low | — | Add OTLP traces; ship structured logs | M | P2 |
| G-17 | i18n/Region | No i18n; data residency single-region | `08` | **P3** | Limits non-English/regulated markets | Low | — | Add i18n framework; plan residency | L | P3 |
| G-18 | Field Service | No PWA/offline/mobile worker journey | `11` | **P3** | No field ops | Low | — | Build FSM/PWA if in scope | L | P3 |
| G-19 | Repo | `dist/` committed in modules | `17` | **P3** | Drift/bloat | Low | — | Build in CI, gitignore dist | S | P3 |
| G-20 | Security | Upload MIME/size/AV + signed URLs unverified | `07` | **P2** | Malicious upload / data leak | Med | — | Verify DMS validation + signed access | M | P2 |

**Totals (Rev 2.2):** P0 = 3 · P1 = **7** · P2 = **5** · P3 = **4** · **Closed = 1** (G-07). *(Rev 1: P0 3 · P1 9 · P2 5 · P3 3. G-08 moved P1→P2→P3 as its modules were governed; G-07 closed outright; no gap was deleted from the register.)*

## Rev 2 closure summary

| Gap | Rev 1 | Rev 2 | Basis |
|---|---|---|---|
| G-08 delivery-half UI journeys | P1 open | **P3 (Rev 2.2)** | 5 verticals merged + HSE governed (`0229`); only fleet/assets/amc remain |
| G-07 rate limiting + CORS | P1 open | **CLOSED** | Edge hardening (`2377a5a1`) is on `main`; mechanism verified in source |
| G-14 back-half E2E + coverage gate | P2 open | **P2, partially closed** | +8 API E2E specs; coverage floor still ungated |
| G-03 browser E2E | P0 open | **P0 still open, narrowed** | 1→10 specs, but spine journey uncovered |
| G-01 / G-02 (RLS + auth posture) | P0 open | **P0 unchanged** | Runtime/ops state; nothing in these PRs touches it |

**The P0 count did not move.** Nothing in PRs #205–#209 addresses production RLS posture or auth configuration, and the browser-E2E blocker was advanced but not cleared. Rev 2 therefore does **not** change the go/no-go verdict in `20`.

> **Note on G-03 — why the gate is not released despite the work landing.** The written acceptance is *"login → create+read for account, opportunity, quotation, contract, project, invoice"*. The create+read half is done and green. The **login** half is blocked, not skipped: `AUTH_JWT_SECRET` is what makes `auth.enabled` true (`auth.service.ts`), and that single flag engages `PermissionsGuard` **across the whole surface** (`permissions.guard.ts:100`). Roles are seeded (`r-admin` with `['*']`, `access.service.ts:50`) but **grants are only hydrated from Postgres** — on the in-memory CI boot no user holds any grant, so turning auth on would 403 every route and take all 11 browser specs down with it. Closing this needs a decision about seeding a dev admin grant, which is a security-adjacent default and belongs with **G-02**, not a test change.
>
> Rev 2 argued that *a gate is binary: partial progress against it does not release the penalty*. That applies to this audit's own work too — hence P0 stands, and the ~68 readiness headline in `20` is unchanged.

> **Note on G-08 (Rev 2.2).** HSE was the residue Rev 2 flagged as "the most material remaining instance", and it is now governed: permit-to-work carries three enforced approval gates (approved risk assessment · segregation of duties · validity window) and incidents carry an investigation lifecycle whose closure is gated on outstanding corrective actions. Each refusal is asserted as a 409 in `apps/api/test/hse-permit-workflow.e2e-spec.ts`, and the journey is driven through the UI in `apps/web/e2e/permit-workflow.spec.ts`. What remains under G-08 — fleet, assets, amc — are asset registers, not controls that authorise dangerous work, hence P3.

> **Note on G-07.** This gap was **not** closed by the five workflow PRs — it was closed by `2377a5a1` ("feat(security): G-07 — HTTP edge hardening"), which was developed on a parallel branch and dated the same day as Rev 1. Rev 1 measured commit `24cbb47a`, where the code genuinely was absent, so Rev 1 was correct at its commit and merely became stale on merge. Flagged here because it was found incidentally while verifying the workflow claims — a reminder that this register can drift from parallel branches, not only from the PRs under review.

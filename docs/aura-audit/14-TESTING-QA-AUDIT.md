# 14 — Testing & QA Audit

## Test inventory (measured)

| Tier | Count | Location |
|---|--:|---|
| Kernel unit tests | 40 | `core/src/**/*.test.ts` |
| Shared/domain unit tests | 44 | `shared/src/**/*.test.ts` |
| Module unit/domain tests | 149 | `modules/**/*.test.ts` (excl. dist) |
| API controller tests | 10 | `apps/api/src/**/*.test.ts` |
| **API E2E (Supertest)** | **33** | `apps/api/test/*.e2e-spec.ts` |
| **Browser E2E (Playwright)** | **1** | `apps/web/e2e/smoke.spec.ts` |
| Architecture fitness tests | 2 | `architecture.fitness.test.ts`, `error-taxonomy.fitness.test.ts` |

Runner: **Vitest** (unit + API e2e via `vitest.config.e2e.ts`) + **Playwright** (web). Coverage runs in CI (`pnpm test:coverage`) — a coverage *percentage* was not computed in this audit (`NOT VERIFIED`).

## Strengths (`VERIFIED_IMPLEMENTED`)

- **Real API-level E2E exists** (33 specs) exercising HTTP → service → store, including cross-module chains: `spine.e2e-spec.ts`, `chains.e2e-spec.ts`, `cost-ledger`, `quantity-ledger`, `ar-contract-cap`, `sod` (segregation of duties), plus deep CRM and tendering journeys.
- **Fitness tests enforce architecture** in CI: module-boundary rules and the no-500-escape error taxonomy fail the build on violation.
- **Deploy-readiness tests** (`ci.yml` `deploy-readiness`): migration chain applies onto empty PG, is idempotent on rerun, the built API boots against it, and a **restore drill** (seed → pg_dump → restore → row-count compare) runs. This is unusually mature.
- Finance (33 tests) and CRM (24) are well-covered.

## Gaps

| Gap | Status | Impact |
|---|---|---|
| **Browser E2E is a single smoke test** | `MISSING` | No regression net for the 151-page UI; user-journey breakage undetected |
| **API E2E is front-half-skewed** | `PARTIALLY_IMPLEMENTED` | 24/33 specs are CRM/tender; engineering, QA/QC, HSE, commissioning, handover, AMC, inventory lack E2E |
| Coverage % unproven here | `NOT VERIFIED` | CI computes it but no threshold gate observed |
| No load/performance tests | `MISSING` | Scale behavior unmeasured (`16`) |
| No security/DAST tests | `MISSING` | No automated authz-bypass / IDOR test suite beyond `sod.e2e` |

## Critical-workflow test matrix

| Workflow | API E2E? | Browser E2E? | Verdict |
|---|:--:|:--:|---|
| Lead → Opportunity → Quotation | ✅ | ❌ | API-covered |
| Tender lifecycle → award | ✅ (`tender-lifecycle`) | ❌ | API-covered |
| Contract → IPC → finance | ⚠️ (`ar-contract-cap`, `chains`) | ❌ | Partial |
| PO → GRN → 3-way match | ⚠️ (`cost-ledger`) | ❌ | Partial |
| Project → EVM → closeout | ⚠️ (`quantity-ledger`) | ❌ | Partial |
| Commissioning → Handover → AMC | ❌ | ❌ | **Untested E2E** |
| Invoice → Payment | ⚠️ | ❌ | Partial |
| Segregation of duties | ✅ (`sod.e2e`) | ❌ | API-covered |

## Recommendations

1. **P0:** add a browser smoke suite for the spine journeys (login → each spine record create/read) to catch UI regressions.
2. **P1:** extend API E2E to the back-half (commissioning/handover/AMC/QA/HSE/inventory).
3. **P1:** set a coverage floor gate in CI; add authz-bypass/IDOR tests.
4. **P2:** add load tests targeting the search fan-out and list endpoints (`16`).

**Testing maturity score: 62/100** — strong unit + API-E2E + deploy-readiness foundation, undermined by near-absent browser E2E and back-half E2E gaps.

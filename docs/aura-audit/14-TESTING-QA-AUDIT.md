# 14 — Testing & QA Audit

## Test inventory (measured)

| Tier | Rev 1 | **Rev 2** | Location |
|---|--:|--:|---|
| Source test files (all tiers) | 249 | **262** | `find … -name '*.test.ts'` excl. dist/node_modules |
| **API E2E (Supertest)** | **33** | **41** | `apps/api/test/*.e2e-spec.ts` |
| **Browser E2E (Playwright)** | **1** | **11** | `apps/web/e2e/*.spec.ts` (Rev 2.1: +`spine-journey`) |
| Architecture fitness tests | 2 | 2 | `architecture.fitness.test.ts`, `error-taxonomy.fitness.test.ts` |

Runner: **Vitest** (unit + API e2e via `vitest.config.e2e.ts`) + **Playwright** (web). Coverage runs in CI (`pnpm test:coverage`) — a coverage *percentage* was not computed in this audit (`NOT VERIFIED`, unchanged at Rev 2).

### Rev 2 — browser E2E now runs against a real API

Rev 1's single smoke spec was, structurally, the only one that *could* pass: the `web-smoke` CI job ran the Next server **alone**, so any spec writing through the BFF would fail by construction. `ci.yml` now builds and boots the API on `:4000` (in-memory stores, no `DATABASE_URL`) before running Playwright, with `RATE_LIMIT_MAX` raised because the whole suite shares one IP bucket behind the Next server. The specs therefore exercise a real request/response round trip.

| Browser spec | Journey driven |
|---|---|
| `drawing-workflow.spec.ts` | Register → 360 → Submit → Start review → Approve (status badge asserted per step) |
| `ncr-workflow.spec.ts` | NCR corrective-action loop |
| `document-workflow.spec.ts` | Document revision lifecycle |
| `site-execution.spec.ts` | Daily report → submit → review → approve |
| `commissioning-workflow.spec.ts` | Test sheet + punch list + retest gate |
| `compliance.spec.ts`, `offline-sync.spec.ts`, `admin-*.spec.ts` (2), `smoke.spec.ts` | Compliance, offline sync, admin control centre, shell/login |
| ▲ `spine-journey.spec.ts` (Rev 2.1) | Account → Opportunity → Quotation → Contract → Project → Invoice: each created **and** read back through the real UI |

**Caveat:** each *delivery-half* spec begins with `test.skip(create.status() === 502 \|\| 404, …)` — if the API is unreachable it **skips rather than fails**. In CI the job hard-fails when the API does not become healthy, so the guard is a local-dev affordance; but a green run does not by itself prove those specs executed. `spine-journey.spec.ts` (Rev 2.1) deliberately **throws instead of skipping under CI**, and is the pattern the others should adopt.

**Rev 2.1 — measured, not estimated.** The full browser suite was executed locally against a fresh in-memory API, both with and without the change:

| Run | Result |
|---|---|
| Clean `1a14a036` | **27 passed · 1 failed · 1 skipped** |
| With `dee209bc` | **34 passed · 0 failed · 1 skipped** |

The +7 is 6 new spine tests plus `offline-sync:168` — a **pre-existing** failure (it fails on clean HEAD) that the drawer-remount fix in the same commit also cures, 32.8s timeout → 6.4s pass.

## Strengths (`VERIFIED_IMPLEMENTED`)

- **Real API-level E2E exists** (33 specs) exercising HTTP → service → store, including cross-module chains: `spine.e2e-spec.ts`, `chains.e2e-spec.ts`, `cost-ledger`, `quantity-ledger`, `ar-contract-cap`, `sod` (segregation of duties), plus deep CRM and tendering journeys.
- **Fitness tests enforce architecture** in CI: module-boundary rules and the no-500-escape error taxonomy fail the build on violation.
- **Deploy-readiness tests** (`ci.yml` `deploy-readiness`): migration chain applies onto empty PG, is idempotent on rerun, the built API boots against it, and a **restore drill** (seed → pg_dump → restore → row-count compare) runs. This is unusually mature.
- Finance (33 tests) and CRM (24) are well-covered.

## Gaps

| Gap | Rev 2 status | Impact |
|---|---|---|
| ~~No browser E2E over the spine journey~~ **DELIVERED (Rev 2.1)** | `VERIFIED_IMPLEMENTED` — G-03 gate still open on its `login →` leg only | `spine-journey.spec.ts` creates + reads all six spine records through the real UI. Suite 27→34 passing. The spine net now exists; what is missing is an **authenticated** run (blocked on grant seeding, see `18`) |
| **API E2E back-half coverage** | `PARTIALLY_IMPLEMENTED` (improved) | +8 specs: engineering, quality, doccontrol, site, commissioning, compliance, ELV devices, RBAC tenant isolation. **hse, fleet, assets, amc, inventory still lack E2E** |
| Coverage % unproven here | `NOT VERIFIED` (unchanged) | CI computes it but no threshold gate observed |
| No load/performance tests | `MISSING` (unchanged) | Scale behavior unmeasured (`16`) |
| No security/DAST tests | `MISSING` (improved slightly) | `rbac-tenant-isolation.e2e-spec.ts` added; still no systematic authz-bypass/IDOR suite beyond it and `sod.e2e` |

## Critical-workflow test matrix

| Workflow | API E2E? | Browser E2E? | Verdict |
|---|:--:|:--:|---|
| ▲ Account → Opportunity → Quotation | ✅ | ✅ (`spine-journey`) | **Fully covered (Rev 2.1)** |
| Tender lifecycle → award | ✅ (`tender-lifecycle`) | ❌ | API-covered |
| ▲ Contract → Project → Invoice | ✅ | ✅ (`spine-journey`) | **Create+read covered (Rev 2.1)**; IPC//payment depth still API-only |
| PO → GRN → 3-way match | ⚠️ (`cost-ledger`) | ❌ | Partial |
| Project → EVM → closeout | ⚠️ (`quantity-ledger`) | ❌ | Partial |
| Invoice → Payment | ⚠️ | ❌ | Partial |
| ▲ Drawing → submit → review → approve | ✅ (`engineering-drawing-workflow`) | ✅ (`drawing-workflow`) | **Fully covered (Rev 2)** |
| ▲ NCR → plan → correct → verify → close | ✅ (`quality-ncr-workflow`) | ✅ (`ncr-workflow`) | **Fully covered (Rev 2)** |
| ▲ Document revision → issue → supersede | ✅ (`doccontrol-document-workflow`) | ✅ (`document-workflow`) | **Fully covered (Rev 2)** |
| ▲ Daily report → submit → review → approve | ✅ (`site-execution-workflow`) | ✅ (`site-execution`) | **Fully covered (Rev 2)** |
| ▲ Commissioning → punch gate → handover | ✅ (`commissioning-handover-workflow`) | ✅ (`commissioning-workflow`) | **Fully covered (Rev 2)** |
| Segregation of duties | ✅ (`sod.e2e`) | ❌ | API-covered |
| ▲ RBAC tenant isolation | ✅ (`rbac-tenant-isolation`) | ❌ | API-covered (Rev 2) |

**The inversion is resolved (Rev 2.1).** At Rev 1 the spine was the well-tested half and the delivery half untested; at Rev 2 that had inverted, with browser proof only on the delivery half. Both halves now carry browser-level journey proof. The remaining asymmetry is depth, not existence: the spine specs prove create+read, the delivery-half specs prove full state-machine transitions.

## Recommendations

1. ~~**P0:** add a browser smoke suite for the **spine** journeys.~~ **DELIVERED (Rev 2.1)** for create+read — `spine-journey.spec.ts`. **Remaining:** the `login →` leg, which needs a dev-grant seeding decision (see `18` G-03), not more spec-writing.
2. **P1:** extend API E2E to the four remaining CRUD modules (hse/fleet/assets/amc) and inventory.
3. **P1:** set a coverage floor gate in CI; add authz-bypass/IDOR tests beyond `rbac-tenant-isolation` and `sod`.
4. **P2:** add load tests targeting the search fan-out and list endpoints (`16`).
5. **P2 (Rev 2):** reconsider the `test.skip`-on-502/404 guard in the workflow specs — it makes an unreachable API look like a pass at the spec level.

**Testing maturity score: 62 → 68 (Rev 2 estimate) → 72/100 (Rev 2.1).** Unlike the Rev 2 figure, this one is backed by an **executed** suite (34 passing, table above), not a design-review estimate. Both halves of the product now carry browser-level journey proof. Held back by the missing **authenticated** spine run, the ungated coverage floor, and no load/DAST testing.

# 14 — Testing & QA Audit

## Test inventory (measured)

| Tier | Rev 1 | **Rev 2** | Location |
|---|--:|--:|---|
| Source test files (all tiers) | 249 | **262** | `find … -name '*.test.ts'` excl. dist/node_modules |
| **API E2E (Supertest)** | **33** | **41** | `apps/api/test/*.e2e-spec.ts` |
| **Browser E2E (Playwright)** | **1** | **10** | `apps/web/e2e/*.spec.ts` |
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

**Caveat:** each workflow spec begins with `test.skip(create.status() === 502 \|\| 404, …)` — if the API is unreachable the spec **skips rather than fails**. In CI the job hard-fails when the API does not become healthy, so the guard is a local-dev affordance; but a green run does not by itself prove the specs executed. **Whether these specs currently pass was not run as part of this revision (`NOT VERIFIED`).**

## Strengths (`VERIFIED_IMPLEMENTED`)

- **Real API-level E2E exists** (33 specs) exercising HTTP → service → store, including cross-module chains: `spine.e2e-spec.ts`, `chains.e2e-spec.ts`, `cost-ledger`, `quantity-ledger`, `ar-contract-cap`, `sod` (segregation of duties), plus deep CRM and tendering journeys.
- **Fitness tests enforce architecture** in CI: module-boundary rules and the no-500-escape error taxonomy fail the build on violation.
- **Deploy-readiness tests** (`ci.yml` `deploy-readiness`): migration chain applies onto empty PG, is idempotent on rerun, the built API boots against it, and a **restore drill** (seed → pg_dump → restore → row-count compare) runs. This is unusually mature.
- Finance (33 tests) and CRM (24) are well-covered.

## Gaps

| Gap | Rev 2 status | Impact |
|---|---|---|
| **No browser E2E over the spine journey** | `MISSING` — **still P0 (G-03)** | 10 specs now exist, but none touches lead/quote/contract/invoice/payment. The 164-page UI has a delivery-half net and **no spine net** |
| **API E2E back-half coverage** | `PARTIALLY_IMPLEMENTED` (improved) | +8 specs: engineering, quality, doccontrol, site, commissioning, compliance, ELV devices, RBAC tenant isolation. **hse, fleet, assets, amc, inventory still lack E2E** |
| Coverage % unproven here | `NOT VERIFIED` (unchanged) | CI computes it but no threshold gate observed |
| No load/performance tests | `MISSING` (unchanged) | Scale behavior unmeasured (`16`) |
| No security/DAST tests | `MISSING` (improved slightly) | `rbac-tenant-isolation.e2e-spec.ts` added; still no systematic authz-bypass/IDOR suite beyond it and `sod.e2e` |

## Critical-workflow test matrix

| Workflow | API E2E? | Browser E2E? | Verdict |
|---|:--:|:--:|---|
| Lead → Opportunity → Quotation | ✅ | ❌ | API-covered — **spine browser gap** |
| Tender lifecycle → award | ✅ (`tender-lifecycle`) | ❌ | API-covered |
| Contract → IPC → finance | ⚠️ (`ar-contract-cap`, `chains`) | ❌ | Partial |
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

**The inversion is worth naming:** at Rev 1 the spine was the well-tested half and the delivery half was untested. At Rev 2 the **delivery half is the only part with browser-level proof**, and the spine — the commercially critical journey — still has none.

## Recommendations

1. **P0 (unchanged, narrowed):** add a browser smoke suite for the **spine** journeys (login → create/read account, opportunity, quotation, contract, project, invoice). The delivery-half pattern in `drawing-workflow.spec.ts` is a working template; the CI job already boots an API, so the infrastructure cost is now near zero.
2. **P1:** extend API E2E to the four remaining CRUD modules (hse/fleet/assets/amc) and inventory.
3. **P1:** set a coverage floor gate in CI; add authz-bypass/IDOR tests beyond `rbac-tenant-isolation` and `sod`.
4. **P2:** add load tests targeting the search fan-out and list endpoints (`16`).
5. **P2 (Rev 2):** reconsider the `test.skip`-on-502/404 guard in the workflow specs — it makes an unreachable API look like a pass at the spec level.

**Testing maturity score: 62 → 68/100 (Rev 2 re-estimate)** — the unit + API-E2E + deploy-readiness foundation is now joined by a real browser harness running against a live API, and the delivery half is genuinely covered end to end. Held back by the **absent spine browser suite**, the ungated coverage floor, and no load/DAST testing.

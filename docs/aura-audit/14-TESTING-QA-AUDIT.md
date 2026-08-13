# 14 — Testing & QA Audit

## Test inventory (measured)

| Tier | Rev 1 | **Rev 2** | Location |
|---|--:|--:|---|
| Source test files (all tiers) | 249 | **262** | `find … -name '*.test.ts'` excl. dist/node_modules |
| **API E2E (Supertest)** | **33** | **43** | `apps/api/test/*.e2e-spec.ts` (Rev 2.2 +`hse-permit-workflow`; Rev 2.3 +`asset-amc-fleet-workflow`) |
| **Browser E2E (Playwright)** | **1** | **13** | `apps/web/e2e/*.spec.ts` (Rev 2.1 +`spine-journey`; Rev 2.2 +`permit-workflow`; Rev 2.3 +`amc-asset-fleet`) |
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

The +7 is 6 new spine tests plus `offline-sync:168`, which passed in that run.

> **Correction (Rev 2.2).** The Rev 2.1 note claimed the drawer-remount fix *cured* `offline-sync:168`. Repeated runs disproved that: the spec is **flaky**, not fixed — it fails on clean HEAD, passed once after the fix, and has failed again since. Worse, **when it fails it can poison the following spec**: its offline queue survives into the next test's context and swallows that test's writes (reproduced deterministically by running `offline-sync` immediately before `permit-workflow`). Treat it as an open test-isolation defect, not a resolved one.

> **Correction (Rev 2.4).** `offline-sync:168` is **fixed** (PR #210, branch `claude/competent-dewdney-d50d92`). The Rev 2.2 diagnosis above was wrong on both counts, and how it was wrong matters more than the fix.
>
> It was not principally a flake. The spec raced `page.close()` against the reconnect; when the close won, the queued item was still `pending`, so the reopened session sent it for the **first** time and the deduplication the spec exists to prove was never exercised at all. **The green runs were the ones in which the test failed to set up its own scenario** — including the Rev 2.1 run tabulated above. Read that `+7` as six spine tests plus one vacuous pass.
>
> The failing runs were the honest ones, and they were failing on two engine defects rather than on test hygiene. Crash recovery reclaimed a stranded item with `updateOfflineItemStatus(id, 'pending')`, which stamps `lastAttemptAt = now`, so the flush loop held the item behind a backoff it had never earned; and nothing anywhere acted on a computed backoff, leaving every deferred retry to the 60s periodic sweep — past the spec's own 30s poll. Instrumented, the reopened page issued **zero writes for 24+ seconds**. The second of those is a field defect, not a test artifact: a report that survived a crash sat on the device for up to a minute before anything retried it.
>
> Staging the crash deterministically — let the POST commit server-side, drop the response, then kill the page — exposed a live product bug the suite had never been in a position to see. The Next BFF rebuilt its outbound headers from scratch and **dropped `Idempotency-Key`**, so the API's global idempotency interceptor never saw it and every offline replay double-committed. Re-introducing the drop makes the spec read 2 rows, so the `toBe(1)` assertion is now load-bearing rather than decorative.
>
> **The poisoning claim does not reproduce — measured on this branch.** Rev 2.2 called it "reproduced deterministically", and a deterministic claim falls to a single counterexample. `offline-sync.spec.ts` → `permit-workflow.spec.ts` was run **five times** at `104e67f1` in an isolated worktree on its own ports, with the spec **unfixed** (#210 deliberately not applied, so the flake was still live). `offline-sync:168` failed once, in the genuine way — the 32.8s poll timeout. **In that very run both `permit-workflow` tests passed**, in 9.2s and 2.4s, and they executed rather than hitting their `test.skip` guard. Across all five runs permit-workflow was 10/10.
>
> The mechanism Rev 2.2 proposed cannot hold either: Playwright gives each test its own context, so the offline queue cannot survive into the next spec. The one genuinely shared channel found was an **aborted in-flight request against the common `next dev` server**, which the redesign removes by letting the request finish server-side. Teardown of IndexedDB, the localStorage fallback, service workers and caches was added regardless.
>
> **Two limits on this result.** It was measured *pre-auth*, at the commit the Rev 2.2 claim was made against; Rev 2.5 has since turned auth on and changed how `permit-workflow` behaves (segregation of duties now bites), so the pairing is worth re-checking in that configuration. And #210's fix has not been run *on this branch* — the two have diverged. What is settled is the narrow thing Rev 2.2 asserted: a failing `offline-sync` does not take `permit-workflow` down with it.

## Strengths (`VERIFIED_IMPLEMENTED`)

- **Real API-level E2E exists** (33 specs) exercising HTTP → service → store, including cross-module chains: `spine.e2e-spec.ts`, `chains.e2e-spec.ts`, `cost-ledger`, `quantity-ledger`, `ar-contract-cap`, `sod` (segregation of duties), plus deep CRM and tendering journeys.
- **Fitness tests enforce architecture** in CI: module-boundary rules and the no-500-escape error taxonomy fail the build on violation.
- **Deploy-readiness tests** (`ci.yml` `deploy-readiness`): migration chain applies onto empty PG, is idempotent on rerun, the built API boots against it, and a **restore drill** (seed → pg_dump → restore → row-count compare) runs. This is unusually mature.
- Finance (33 tests) and CRM (24) are well-covered.

## Gaps

| Gap | Rev 2 status | Impact |
|---|---|---|
| ~~No browser E2E over the spine journey~~ **CLOSED (Rev 2.5)** | `VERIFIED_IMPLEMENTED` — **G-03 closed** | The suite signs in through the real login form, then creates and reads back all six spine records **authenticated**. 41 passed / 0 failed, twice, on a cold server against an auth-enabled API |
| ~~API E2E back-half coverage~~ **COMPLETE (Rev 2.3)** | `VERIFIED_IMPLEMENTED` | +10 specs: engineering, quality, doccontrol, site, commissioning, compliance, ELV devices, RBAC tenant isolation, HSE, **amc/assets/fleet**. **Only inventory still lacks E2E** |
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
| ▲▲ Permit to work → approve → close | ✅ (`hse-permit-workflow`) | ✅ (`permit-workflow`) | **Fully covered (Rev 2.2)** — incl. all three approval refusals |
| ▲▲ Incident → investigate → CAPA gate → close | ✅ (`hse-permit-workflow`) | ❌ | API-covered (Rev 2.2) |
| ▲▲▲ Work order → assign → complete (SLA stamped) | ✅ (`asset-amc-fleet-workflow`) | ✅ (`amc-asset-fleet`) | **Fully covered (Rev 2.3)** |
| ▲▲▲ Asset → maintenance → disposal gate | ✅ (`asset-amc-fleet-workflow`) | ✅ (`amc-asset-fleet`) | **Fully covered (Rev 2.3)** |
| ▲▲▲ Traffic fine → dispute → resolve | ✅ (`asset-amc-fleet-workflow`) | ✅ (`amc-asset-fleet`) | **Fully covered (Rev 2.3)** |

**The inversion is resolved (Rev 2.1).** At Rev 1 the spine was the well-tested half and the delivery half untested; at Rev 2 that had inverted, with browser proof only on the delivery half. Both halves now carry browser-level journey proof. The remaining asymmetry is depth, not existence: the spine specs prove create+read, the delivery-half specs prove full state-machine transitions.

## Recommendations

1. ~~**P0:** add a browser smoke suite for the **spine** journeys.~~ **DELIVERED (Rev 2.1)** for create+read — `spine-journey.spec.ts`. **Remaining:** the `login →` leg, which needs a dev-grant seeding decision (see `18` G-03), not more spec-writing.
2. ~~**P1:** extend API E2E to the four remaining CRUD modules (hse/fleet/assets/amc) and inventory.~~ **Done for all four (Rev 2.2–2.3); only inventory remains.**
3. **P1:** set a coverage floor gate in CI; add authz-bypass/IDOR tests beyond `rbac-tenant-isolation` and `sod`.
4. **P2:** add load tests targeting the search fan-out and list endpoints (`16`).
5. **P2 (Rev 2):** reconsider the `test.skip`-on-502/404 guard in the workflow specs — it makes an unreachable API look like a pass at the spec level.

**Testing maturity score: 62 → 68 (Rev 2 estimate) → 72 (Rev 2.1) → 76/100 (Rev 2.5).** Unlike the Rev 2 figure, this one is backed by an **executed** suite (34 passing, table above), not a design-review estimate. Both halves of the product now carry browser-level journey proof. Held back by the missing **authenticated** spine run, the ungated coverage floor, and no load/DAST testing.

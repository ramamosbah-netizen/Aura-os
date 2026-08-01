# Testing Report

**Score: 7.0 / 10** — strong domain/unit + API e2e discipline with real correctness proofs in CI. Two gaps hold it back: almost no frontend testing, and the fastest-growing layer (intelligence/AI) is nearly untested.

## 1. Test inventory (measured)

| Area | Test files | Kind |
|---|---:|---|
| `modules/*` | **128** | unit / domain (run on in-memory adapters) |
| `shared` | 43 | pure unit (value objects, form engine, JWT/crypto) |
| `core` | 38 | kernel unit (event store, outbox, idempotency, RLS pool, access) |
| `apps/api` | 9 | HTTP e2e (Supertest) |
| `intelligence` | **4** | unit |
| `apps/web` | 1 | Playwright smoke |
| **Total** | **~223** | |

## 2. What's tested well

- **Domain logic** — 128 module tests exercise pure entities and services against in-memory stores (e.g. `modules/finance/**`, `modules/crm/**`, `modules/contracts/domain/*.test.ts`). The port/adapter pattern makes this fast and hermetic.
- **Kernel invariants** — 38 core tests cover the load-bearing spine: `outbox-relay.test.ts`, `idempotency.interceptor.test.ts`, `tenant-scoped-pool.test.ts`, `pg-pool.test.ts`, `access.service`, `approval-matrix`. Exactly the right things to test.
- **API contracts** — 9 Supertest e2e specs (`apps/api/test/*.e2e-spec.ts`) cover CRM chains, account graph, automation, forecast, health dimensions. `chains.e2e-spec.ts` implies cross-module flow coverage.
- **CI-level correctness proofs** (beyond unit tests) — RLS fitness + isolation, migration idempotency, restore-drill row parity, SDK drift, deploy-gate degradation. These are effectively **property/integration tests encoded in the pipeline** and are unusually thorough.
- **Coverage gate** — `pnpm test:coverage` runs in CI (`@vitest/coverage-v8`).

## 3. Gaps

| Gap | Severity | Detail |
|---|---|---|
| **Frontend tests** | **High** | 133 pages / 166 components, **1** Playwright smoke test. No component tests, no interaction tests, no visual regression. The mega client components (1,000–1,900 LOC) are entirely untested. |
| **Intelligence/AI layer** | **High** | 40+ services, **4** tests. The layer now owns persistence (mig 0193–0195) and is the largest uncommitted surface — growing far faster than its coverage. |
| **e2e breadth** | Medium | 9 API e2e specs are CRM-heavy; delivery-side workflows (procurement→inventory→project→handover→invoice) have thin end-to-end coverage. |
| **Coverage % unknown** | Medium | gate exists but no threshold is asserted here; confirm a minimum (e.g. 70%) is enforced, not just measured. |
| **Load/perf tests (web)** | Medium | backend perf harness exists (memory: P1); no web load/Lighthouse tests. |
| **a11y tests** | Medium | none; hand-rolled components have no a11y baseline. |

## 4. Test quality observations

- Tests run on **in-memory adapters**, which is fast and isolating but means the **postgres adapters themselves are largely validated only through the CI boot/e2e path**, not per-adapter unit tests. Some `postgres-*.test.ts` exist (e.g. `modules/amc/src/postgres-amc-store.test.ts`) but not universally. SQL-shape bugs can slip past module tests.
- The "measure by Completed Business Journeys" doctrine (memory: `journey-audits`) is a healthy testing philosophy — but journey scores are manual/periodic, not automated regression gates. Encoding the top journeys as automated e2e would lock them in.

## Recommendations (ranked)

1. **Test the intelligence layer** — it's the highest risk-to-coverage ratio in the repo. Unit-test guardrails, routing, evaluation, billing before it grows further.
2. **Build a frontend test suite** — component tests (Vitest + Testing Library) for the mega-components, plus Playwright e2e for the top user journeys (create quote, approve invoice, raise PO, close project).
3. **Automate the top business journeys** (Lead→Quote→Contract→Project→Invoice→Payment) as e2e regression gates.
4. **Assert a coverage threshold** in CI, not just collection.
5. **Add postgres-adapter tests** (Testcontainers) for financial/integrity-critical stores.
6. **Add a11y + Lighthouse checks** to `web-smoke`.

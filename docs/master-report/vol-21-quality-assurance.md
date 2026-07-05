# Volume 21 — Quality Assurance

[← Master index](README.md)

---

## 1. Testing (current, verified)

| Layer | State | Evidence |
|---|---|---|
| Unit / module | ✅ strong | 132 `*.test.ts` vitest files colocated; in-memory adapters make module tests infra-free; Finance deepest (18), form engine 22+ cases |
| Domain calculations | ✅ | double-entry, WAC, EVM, EOSB, IFRS-15, formula engine — all pure-function tested |
| Integration (live pg) | ◐ thin | 1 test (journal trigger — the most important invariant, correctly chosen) |
| API HTTP e2e | ✅ | Supertest suite in CI (`pnpm --filter @aura/api test:e2e`) |
| Browser e2e | ◐ smoke | Playwright Chromium smoke (`apps/web/e2e/smoke.spec.ts`) in CI |
| Manual verification | ✅ disciplined | every shipped feature live-verified + written to `docs/reports/` (28 reports) |

Distribution risk: weakest modules Engineering (1 file), HSE/Site/Assets/DocControl (2 each) —
matches Volume 3 flags.

## 2. Automation

CI on every push (Volume 18 §3): lint → typecheck → coverage tests → API e2e → dependency
audit → web smoke. Local = same commands (`pnpm lint/typecheck/test`). [Gap]: pre-merge
migration gate (apply all migrations against a scratch pg in CI).

## 3. Performance

[Gap — P1]. Nothing measured. Plan: k6 baseline against the seeded demo tenant — the four
hot paths: list endpoints under pagination, GRN-accept reactor chain (write amplification),
statements fold, event-relay throughput. Budgets to set *before* optimizing: p95 read <200ms,
write <500ms, relay lag <2s at 50 rps.

## 4. Security testing

Current: parameterized-SQL audit (manual), `pnpm audit` in CI (non-blocking `|| true` —
tighten to fail on high/critical [S]). [Gap]: SAST (semgrep), secret scanning (the Vol 7 §10
incident makes this urgent), authz test suite once the permission taxonomy lands, external
pen test pre-GA.

## 5. Accessibility

Foundations present (Vol 10 §12), **unaudited**. Plan: axe-core pass in Playwright on the top
15 pages, keyboard-only walkthrough of drawer forms + palette, contrast check of the token
palette (both themes), reduced-motion support. Target: WCAG 2.1 AA on the working set.

## 6. Regression

Strategy today: unit breadth + API e2e + smoke + the frozen `CreateDrawer` adapter contract
(20 call sites proved zero-regression through the engine swap — the pattern to repeat).
[Gap]: golden-flow browser suite (the Vol 11 §10 master chain as one scripted E2E — lead to
closeout) run nightly; visual regression on the design system [P3].

## 7. Load Testing

[Gap — P2, after §3 baselines]. Scenarios: 200 concurrent users mixed CRUD; 10k-event backlog
relay drain; 100k-row aging/statement folds; webhook fan-out under consumer failure
(retry/dead-letter behavior under pressure).

## 8. QA gates by roadmap version (binding)

| Gate | V1 | V2 | V3 |
|---|---|---|---|
| Coverage threshold enforced | 60% | 70% | 75% |
| Migration gate in CI | ✅ | ✅ | ✅ |
| Golden-flow E2E | 1 chain | +mobile flows | +portal flows |
| Perf budgets in CI | baseline recorded | budget-enforced | regression-blocked |
| axe pass | top 15 pages | all pages | plugin-authored UIs too |
| Pen test | pre-GA | annual | annual + bounty |
| Restore drill | once | quarterly | quarterly |

---

*Next: [Volume 22 — Competitive Analysis](vol-22-competitive-analysis.md)*

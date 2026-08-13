# 22 — Recommended Roadmap

Each item: objective · modules · files/components · dependencies · risk · complexity · acceptance criteria.

## P0 — Production Blockers (do first; ship-gate)

### P0.1 Prove & enforce production tenant isolation
- **Objective:** every non-dev environment connects as `aura_app` (NOSUPERUSER/NOBYPASSRLS) with FORCE RLS.
- **Files:** `apps/api/src/main.ts` (RLS posture gate), `infrastructure/migrations/0163/0164`, deploy config.
- **Dependencies:** DB provisioning access.
- **Risk:** Critical if skipped (cross-tenant leak).
- **Complexity:** S (ops) + a startup assertion that logs posture per env.
- **Acceptance:** boot log shows `RLS posture: enforced` in staging & prod; an automated test connects as `aura_app` and confirms a cross-tenant query returns 0 rows.

### P0.2 Enforce authentication in production
- **Objective:** production runs with a JWT verifier and `AUTH_REQUIRED=true`.
- **Files:** `main.ts` auth posture gate, `AuthService`, env.
- **Dependencies:** IdP/JWKS or secret.
- **Risk:** Critical (open API).
- **Complexity:** S.
- **Acceptance:** an unauthenticated request to any protected route returns 401 in staging; boot is fatal if verifier absent.

### P0.3 Browser E2E smoke net — **still open, now scoped to the spine (Rev 2)**
- **Objective:** catch UI journey regressions on the acquisition-to-cash spine.
- **Modules:** web + spine APIs.
- **Files:** `apps/web/e2e/*`, `playwright.config.ts`, CI.
- **Dependencies:** ~~seeded demo data~~ — **now unblocked.** `ci.yml` `web-smoke` builds and boots the API on `:4000` (in-memory stores) before Playwright, and `apps/web/e2e/drawing-workflow.spec.ts` is a working template (seed via BFF → drive UI → assert status per step).
- **Risk:** High (unchanged — the spine is the commercially critical path).
- **Complexity:** ~~M~~ **S–M** — harness and pattern exist; this is spec-writing.
- **Acceptance:** CI runs login → create+read for account, opportunity, quotation, contract, project, invoice; fails the build on breakage.
- **Rev 2.1 status (commit `dee209bc`):** `spine-journey.spec.ts` **delivers the create+read half** for all six spine records through the real UI, and does fail rather than skip on an unreachable API under CI (the guard recommendation above is implemented). **Outstanding:** the `login →` leg — blocked because enabling `AUTH_JWT_SECRET` engages `PermissionsGuard` globally while no user holds a grant on an in-memory boot. Needs a dev-grant seeding decision; tracked with **G-02**.

## P1 — Enterprise Hardening

| Item | Objective | Modules/Files | Complexity | Acceptance |
|---|---|---|---|---|
| P1.1 Search index | Replace fan-out | `search.service.ts`, pgvector/FTS | M | Search is O(log n); load test at 10⁵ rows < 300ms |
| P1.2 Error semantics | Distinguish empty/error/denied | `apps/web/lib/api.ts` + pages | S | Pages show distinct 403/500/empty UI |
| ~~P1.3 Perimeter~~ | ✅ **DELIVERED (Rev 2)** — rate limiting + CORS allowlist + CSP + body cap (commit `2377a5a1`) | `main.ts`, `core/src/http/` | done | Met. Residual: set `CORS_ALLOWED_ORIGINS` per env; add per-actor limits |
| P1.4 Referential integrity | Orphan-scan gate + FKs | migrations, CI | M | CI fails on orphaned spine rows |
| P1.5 Money type | Decimal money | finance/projects domain | M | No float in ledger math; balancing test passes |
| P1.6 Outbox operator UI | Inspect/replay dead-letter | admin + `poison-subscriber` | M | Admin can replay a dead event |
| ~~P1.7 Back-half journeys~~ | ✅ **DELIVERED (Rev 2)** — engineering, doccontrol, site, QA/QC, commissioning each have an in-app create→transition→complete journey with an enforced state machine (PRs #205–#209). **Residual → P2.5** | those modules + web | ~~L~~ done | Met for the five; **HSE/fleet/assets/amc not covered** |
| P1.8 Inventory depth | Batch/lot, reservations, valuation | inventory | M | Valuation method defined + tested |
| P1.9 Coverage + back-half E2E | **Partially delivered (Rev 2)** — API E2E 33→41 incl. all five verticals; **coverage floor still ungated** | CI, `apps/api/test` | ~~M~~ S–M | Coverage floor enforced; E2E extended to hse/fleet/assets/amc/inventory |

## P2 — Product Completion

- **P2.5 (Rev 2, promoted from P1.7 residue): HSE workflow engine** — permit-to-work + risk assessment, following the state-machine pattern established by PRs #205–#209. HSE is the last delivery-half module still at CRUD and is safety-critical for ELV/construction (`10`, `18` G-08). Then fleet/assets/amc lifecycle depth.
- Notifications multi-channel (email/SMS/push) with retry + audit (`13`,`G-13`).
- Reporting materialization + freshness contract; dashboard caching (`16`).
- DMS upload validation (MIME/size/AV) + signed URLs (`G-20`).
- Connector/webhook catalog depth; SCIM provisioning.
- Observability: OTLP traces + structured log shipping + alerts.

## P3 — Scale & Resilience

- Move reactors to a worker/broker; horizontal API scaling validated under load.
- Read replicas + cached aggregations; enforce pagination platform-wide.
- CD pipeline (promotion, canary, rollback), IaC, secret scanning.
- i18n framework; data-residency plan.

## P4 — Strategic Differentiation

- Field Service / PWA (offline, GPS, signatures, spare parts).
- Visual workflow/BPMN designer over the orchestrator.
- AI copilots grounded on the event stream (intelligence module).
- Compliance program (SOC2), advanced analytics.

## Sequencing

P0 (2–4 weeks, mostly ops + one test suite) → P1 (the hardening quarter) → P2 (completion) → P3/P4 (scale & strategy). **Do not start P2 feature work before P0 is closed** — it is the ship-gate.

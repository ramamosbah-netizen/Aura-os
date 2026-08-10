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

### P0.3 Browser E2E smoke net
- **Objective:** catch UI journey regressions.
- **Modules:** web + spine APIs.
- **Files:** `apps/web/e2e/*`, `playwright.config.ts`, CI.
- **Dependencies:** seeded demo data.
- **Risk:** High.
- **Complexity:** M.
- **Acceptance:** CI runs login → create+read for account, opportunity, quotation, contract, project, invoice; fails the build on breakage.

## P1 — Enterprise Hardening

| Item | Objective | Modules/Files | Complexity | Acceptance |
|---|---|---|---|---|
| P1.1 Search index | Replace fan-out | `search.service.ts`, pgvector/FTS | M | Search is O(log n); load test at 10⁵ rows < 300ms |
| P1.2 Error semantics | Distinguish empty/error/denied | `apps/web/lib/api.ts` + pages | S | Pages show distinct 403/500/empty UI |
| P1.3 Perimeter | Rate limiting + CORS allowlist | `main.ts` | S | Throttled; only allowed origins |
| P1.4 Referential integrity | Orphan-scan gate + FKs | migrations, CI | M | CI fails on orphaned spine rows |
| P1.5 Money type | Decimal money | finance/projects domain | M | No float in ledger math; balancing test passes |
| P1.6 Outbox operator UI | Inspect/replay dead-letter | admin + `poison-subscriber` | M | Admin can replay a dead event |
| P1.7 Back-half journeys | Completable UIs for engineering/site/QA/commissioning | those modules + web | L | Each has an in-app create→transition→complete journey |
| P1.8 Inventory depth | Batch/lot, reservations, valuation | inventory | M | Valuation method defined + tested |
| P1.9 Coverage + back-half E2E | Gate coverage, extend E2E | CI, `apps/api/test` | M | Coverage floor enforced; back-half E2E green |

## P2 — Product Completion

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

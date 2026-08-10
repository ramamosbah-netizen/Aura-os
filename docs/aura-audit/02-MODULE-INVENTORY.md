# 02 — Module Inventory & Maturity Matrix

20 domain modules discovered under `modules/*` and composed in `apps/api/src/app.module.ts`. Counts below are measured (`find` over `apps/api/src/<m>` and `modules/<m>/src`). "PG stores" = Postgres adapter files; tests = `*.test.ts` in module + controllers; pages = `apps/web/app/<m>/**/page.tsx`.

## Module Maturity Matrix

| Module | Controllers | PG stores | Services | Tests | Web pages | Depth verdict | Score /100 |
|---|--:|--:|--:|--:|--:|---|--:|
| **crm** | 26 | 15 | 15 | 24 | 20 | Deep lifecycle (lead→opp→quote→forecast) | 82 |
| **finance** | 6 | 15 | 15 | 33 | 21 | Deep (AR/AP/tax/PDC/bank/budget/period-close) | 80 |
| **tendering** | 5 | 8 | 6 | 10 | 4 | Solid (lifecycle, BOQ, pricing, win/loss) | 74 |
| **contracts** | 5 | 6 | 5 | 6 | 6 | Solid (bonds, IPC, clauses, obligations) | 74 |
| **projects** | 1 | 10 | 10 | 12 | 5 | Deep domain, thin controller surface | 70 |
| **procurement** | 4 | 5 | 5 | 7 | 9 | Solid P2P + framework agreements | 72 |
| **inventory** | 5 | 5 | 5 | 8 | 8 | Solid (stock, serial, GRN) | 71 |
| **hr** | 1 | 9 | 1 | 9 | 10 | Data-rich, thin orchestration | 62 |
| **quality** | 1 | 8 | 1 | 4 | 7 | Data-rich (ITP/NCR), thin service layer | 58 |
| **engineering** | 1 | 7 | 1 | 4 | 1 | Model depth, near-zero UI | 52 |
| **doccontrol** | 1 | 5 | 1 | 5 | 1 | Model depth, near-zero UI | 52 |
| **subcontracts** | 1 | 1 | 1 | 4 | 5 | Narrow but wired (backcharge reactor) | 58 |
| **site** | 1 | 1 | 1 | 5 | 3 | Daily-report/labour/plant events | 58 |
| **hse** | 1 | 1 | 1 | 4 | 3 | CRUD-level | 50 |
| **fleet** | 1 | 1 | 1 | 4 | 3 | CRUD-level | 50 |
| **assets** | 1 | 1 | 1 | 4 | 3 | CRUD + disposal reactor | 54 |
| **amc** | 1 | 2 | 1 | 3 | 3 | Work-order lifecycle, wired to finance | 56 |
| **commissioning** | 2 | 1 | 2 | 2 | 1 | Thin | 48 |
| **market-intelligence** | 2 | 1 | 1 | 2 | 0 | Backend-only | 44 |
| **intelligence** | 1 | 0 | 0 | 0 | 1 | Aggregation/AI surface, no store | 40 |

Additional kernel-hosted surfaces (not in `modules/`): **admin** (control plane), **auth/identity**, **documents/DMS**, **workflow**, **notifications**, **inbox/comms**, **search**, **views** (saved views), **ai/builder**, **health/observability**, **templates**, **demo** (seeders).

## A–M analysis (representative modules)

Full A–M treatment for the deepest verticals is in the domain docs (`09` finance/commercial, `10` project/engineering/QA/HSE, `11` commissioning/handover/AMC, `12` inventory/procurement, `13` admin). Summary of the recurring pattern:

- **A. Purpose / B. Capabilities:** each module solves a real ERP sub-domain and exposes CRUD + lifecycle transitions through its service API.
- **C. UI:** front-half modules (crm/finance/procurement/inventory/hr) have multi-page workspaces; back-half modules often have a single page or none.
- **D. Backend:** controllers are thin; business rules live in `modules/<m>/src/*.service.ts` and `domain/*.ts`.
- **E. Database:** each module owns its tables via numbered migrations; see `04`.
- **F–G. Logic / Workflow:** state machines exist in services and are reinforced by cross-module reactors (`03`).
- **H. Permissions:** enforced centrally by the derived-permission `PermissionsGuard` (`05`,`07`).
- **I. Validation:** global `ValidationPipe` + `assertFormValid` server-side form engine (`shared/src/forms`).
- **J. Auditability:** kernel audit service + event stream (`core/src/audit`, `aura_events`).
- **K. Testing:** unit/module tests are strongest in finance/crm; back-half thin (`14`).
- **L. Gaps / M. Score:** see per-module score column and `18`.

## Key inventory findings

- **`VERIFIED_IMPLEMENTED`** — 20 modules are real domain packages wired into the host, each with Postgres persistence.
- **`PARTIALLY_IMPLEMENTED`** — engineering, doccontrol, quality, hse, fleet, market-intelligence, intelligence: data/store depth exceeds UI/orchestration depth.
- **Depth asymmetry is the headline gap:** the "sell" half (CRM→tender→contract→finance) is enterprise-shaped; the "deliver" half (engineering→site→QA→commissioning→handover) is CRUD-shaped and under-surfaced in the UI.

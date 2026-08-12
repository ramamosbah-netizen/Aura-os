# 02 — Module Inventory & Maturity Matrix

20 domain modules discovered under `modules/*` and composed in `apps/api/src/app.module.ts`. Counts below are measured (`find` over `apps/api/src/<m>` and `modules/<m>/src`). "PG stores" = Postgres adapter files; tests = `*.test.ts` in module + controllers; pages = `apps/web/app/<m>/**/page.tsx`.

> **Rev 2 (2026-08-12, commit `1a14a036`).** All counts below are **re-measured**; the method was validated by reproducing Rev 1's figures exactly at Rev 1's commit for unchanged modules (crm 26/15/15/24/20, tendering, contracts). Rows changed by the five merged workflow verticals (PRs #205–#209) are marked **▲**. Scores are **re-estimates from merged source**, on Rev 1's design-review basis — not a live benchmark.

## Module Maturity Matrix

| Module | Controllers | PG stores | Services | Tests | Web pages | Depth verdict | Score /100 |
|---|--:|--:|--:|--:|--:|---|--:|
| **crm** | 26 | 15 | 15 | 24 | 20 | Deep lifecycle (lead→opp→quote→forecast) | 82 |
| **finance** | 6 | 15 | 15 | 32 | 21 | Deep (AR/AP/tax/PDC/bank/budget/period-close) | 80 |
| **tendering** | 5 | 8 | 6 | 10 | 4 | Solid (lifecycle, BOQ, pricing, win/loss) | 74 |
| **contracts** | 5 | 6 | 5 | 6 | 6 | Solid (bonds, IPC, clauses, obligations) | 74 |
| **projects** | 1 | 10 | 10 | 12 | 6 | Deep domain, thin controller surface | 70 |
| **procurement** | 4 | 5 | 5 | 7 | 9 | Solid P2P + framework agreements | 72 |
| **inventory** | 5 | 5 | 5 | 8 | 8 | Solid (stock, serial, GRN) | 71 |
| **hr** | 1 | 9 | 1 | 9 | 10 | Data-rich, thin orchestration | 62 |
| ▲ **quality** | 1 | 9 | 1 | 5 | 8 | **Governed NCR corrective-action loop + verification records + NCR 360** | **68** |
| ▲ **engineering** | 1 | 9 | 1 | 5 | 3 | **Governed drawing state machine + immutable revisions + Register/360** | **68** |
| ▲ **doccontrol** | 1 | 6 | 1 | 6 | 4 | **Governed revision lifecycle + transmittal issue/acknowledge** | **66** |
| **subcontracts** | 1 | 1 | 1 | 4 | 5 | Narrow but wired (backcharge reactor) | 58 |
| ▲ **site** | 1 | 2 | 1 | 6 | 6 | **Governed daily-report aggregate + 5 typed line-items + approval** | **68** |
| **hse** | 1 | 1 | 1 | 4 | 3 | CRUD-level | 50 |
| **fleet** | 1 | 1 | 1 | 4 | 3 | CRUD-level | 50 |
| **assets** | 1 | 1 | 1 | 4 | 3 | CRUD + disposal reactor | 54 |
| **amc** | 1 | 2 | 1 | 3 | 3 | Work-order lifecycle, wired to finance | 56 |
| ▲ **commissioning** | 2 | 1 | 2 | 3 | 2 | **Test sheet + punch list + retest gate on the handover spine** | **62** |
| **market-intelligence** | 2 | 1 | 1 | 2 | 0 | Backend-only | 44 |
| **intelligence** | 1 | 0 | 0 | 0 | 1 | Aggregation/AI surface, no store | 40 |

*Finance tests read 33 at Rev 1 and 32 now: `modules/finance/src/domain/tenant-guard.test.ts` was consolidated into `shared/src/identity/tenant-guard.test.ts` (commit `b01bec2f`). No coverage was lost.*

## Rev 2 — what the five verticals actually added (verified in source)

| Module | Governing artefact | Evidence |
|---|---|---|
| engineering | `DRAWING_TRANSITIONS` + `canTransitionDrawing`/`assertDrawingTransition` | `modules/engineering/src/domain/drawing.ts:30,146` |
| quality | `NCR_TRANSITIONS` — `raised→action_planned→corrected→closed`, with `corrected→action_planned` loop-back on failed verify; root cause + corrective action mandatory at `plan` | `modules/quality/src/domain/ncr.ts:19,126` |
| doccontrol | `DOCUMENT_TRANSITIONS` — `draft→…→issued→superseded`; terminal states escape only via a new revision (`REVISABLE_STATUSES`) | `modules/doccontrol/src/domain/document-revision.ts:26,37` |
| site | `DAILY_REPORT_TRANSITIONS` — `draft→submitted→under_review→approved\|rejected`; approved is immutable, reject requires a reason | `modules/site/src/domain/daily-report.ts:19,142,148` |
| commissioning | **Service-level retest gate** — commissioning is refused while any punch item is `open` | `modules/commissioning/src/commissioning.service.ts:78-81` |

Each vertical also ships an API E2E spec and a browser E2E spec that drives the real UI (`14`).

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
- **`PARTIALLY_IMPLEMENTED`** — hse, fleet, assets, amc, market-intelligence, intelligence: data/store depth exceeds UI/orchestration depth. *(Rev 2: engineering, doccontrol, quality and site have left this list.)*
- **Depth asymmetry was the Rev 1 headline gap — it is now substantially narrowed.** The "sell" half (CRM→tender→contract→finance) remains enterprise-shaped; the "deliver" half (engineering→doccontrol→site→QA→commissioning→handover) is **no longer CRUD-shaped**: each stage now has an enforced state machine, child-record depth, and a completable in-app journey backed by browser E2E.
- **Rev 2 residual asymmetry:** the remaining CRUD-level modules are **hse, fleet, assets, amc** (plus the two intelligence surfaces). Of these, **HSE is the most material** for an ELV/construction operator — incidents, observations and permits are still CRUD with no permit-to-work or risk-assessment workflow engine (`10`). This is the sharpest remaining instance of the original gap and is where G-08's residue now sits (`18`).

# 10 — Projects / Engineering / Site / QA-QC / HSE Audit

## Projects — `VERIFIED_IMPLEMENTED` domain, thin controller surface

Domain (`modules/projects/src/domain/`): `project.ts`, `wbs.ts`, `schedule.ts`, `schedule-planning.ts`, `cbs.ts` (cost breakdown), `cost-transaction.ts` + `quantity-transaction.ts` (append-only ledgers), `cashflow-forecast.ts`, `variation.ts`, `delay-eot.ts`, `closeout.ts`. 10 Postgres stores, 10 services, 12 tests.

### Earned Value — genuinely computed (`VERIFIED_IMPLEMENTED`)

`modules/projects/src/domain/wbs.ts`:
- `earnedValue = plannedValue × (progress/100)` (line 49)
- `cpi = EV/AC` (guarded, line 71), `spi = EV/PV` (line 72)

This is **real EVM math**, not stored placeholders. PV/EV/AC/CPI/SPI roll up the WBS. (EAC/ETC/variance: verify they are derived from these — `NOT FULLY VERIFIED`, but the primitives exist.)

### Project controls present

WBS, schedule + baseline planning, variations, delay/EOT (extension-of-time) claims, cashflow forecast, closeout loop (`projects.project.completed` → contract completion). This is a **credible project-controls core** (Primavera-lite domain shape).

## Engineering & Document Control — `VERIFIED_IMPLEMENTED` (Rev 2)

> **Rev 2 (2026-08-12).** Rev 1's "model depth, UI near-zero" verdict is **superseded** by PRs #205 (mig `0224`) and #207 (mig `0226`).

- **Engineering:** 9 Postgres stores, 1 controller, **3 web pages** (`/engineering`, `/engineering/drawings`, `/engineering/drawings/[id]`), 5 tests.
  - Governed shop-drawing lifecycle: `DRAWING_TRANSITIONS` with `canTransitionDrawing`/`assertDrawingTransition` (`modules/engineering/src/domain/drawing.ts:30,146`), backed by `drawing-store`, `drawing-submission-store`, `drawing-review-store` — immutable revisions plus submission/review records.
  - Completable journey verified in a browser E2E: Register → 360 → Submit → Start review → Approve, asserting the status badge at each step (`apps/web/e2e/drawing-workflow.spec.ts`).
- **Doc control:** 6 stores, 1 controller, **4 pages** (register, register/[id], submittals, transmittals), 6 tests.
  - `DOCUMENT_TRANSITIONS`: `draft→submitted→under_review→approved→issued→superseded`; terminal states escape **only via a new revision** (`REVISABLE_STATUSES`, `modules/doccontrol/src/domain/document-revision.ts:26,37`). Transmittal lifecycle + acknowledgement are separate aggregates (`transmittal`, `transmittal-item`, `transmittal-acknowledgement`).
  - The register stays the header; lifecycle lives on the per-revision aggregate — so revision history is now immutable rather than overwritten.
- Reactor `engineering.document.submitted` (`03` #9) still wires submittals to doc-control; the transmittal hand-off is reused via reactor rather than duplicated.
- **Residual gap:** the two modules remain **1 controller each** — the API surface is narrow relative to store depth, so orchestration is concentrated in one service per module.

## Site execution — `VERIFIED_IMPLEMENTED` (Rev 2)

> **Rev 2.** Superseded by PR #208 (mig `0227`).

- Governed `SiteDailyReport` aggregate: `draft→submitted→under_review→approved|rejected` (`modules/site/src/domain/daily-report.ts:19`). **Approved is immutable**; **reject requires a reason** and auto-reopens the report (`:142,148`).
- Five typed child line-items keyed by `dailyReportId` — labour, plant, progress (`boqItemId` + %), delay, evidence (`fileId` ref) — in `domain/daily-report-lines.ts`, with a **draft-only edit guard**.
- 2 stores, 1 controller, **6 pages**, 6 tests, plus `apps/web/e2e/site-execution.spec.ts`.
- The pre-existing project-level ledger events (`site.installation.recorded`, `site.labour.logged`, `site.plant.logged`, reactors 19/21/22) were **left untouched** — the new aggregate sits alongside them, it does not replace the cost/progress feed.

## QA / QC — `VERIFIED_IMPLEMENTED` (Rev 2)

> **Rev 2.** Rev 1's "corrective-action lifecycle not verified end-to-end" is **now closed** by PR #206 (mig `0225`).

- 9 Postgres stores, 1 controller, **8 pages**, 5 tests.
- **NCR corrective-action loop** (`modules/quality/src/domain/ncr.ts:19`): `raised→action_planned→corrected→closed`, with `corrected→action_planned` **loop-back when verification rejects** the correction. `plan` mandates root cause + corrective action + owner (`:126`); `verify` is the QA close-out and writes an **immutable verification record** (`domain/ncr-verification.ts`, `postgres-ncr-verification-store.ts`).
- **IR→NCR provenance** is now recorded, so an inspection failure traces to its non-conformance. Reactor `quality.ir.approved` still gates progress (reactor 20).
- **Residual gap:** evidence/photo traceability on the NCR itself is still **not verified** end-to-end.

## HSE — `VERIFIED_IMPLEMENTED` (Rev 2.2)

> **Rev 2.2.** Rev 1's "no verified risk-assessment or permit-to-work workflow engine" is **now closed** by migration `0229`. Rev 2 called HSE the weakest link in the delivery half; that is no longer true.

- 1 store, 1 controller, **5 pages**, **5 test files (34 tests)**, plus an API E2E and a browser E2E spec.
- **Permit to work** is now a governed authorisation, not a status field (`modules/hse/src/domain/permit-to-work.ts:30`): `draft → requested → approved → closed`, with `rejected` returning to draft and `closed`/`expired` terminal. Three gates stand in front of approval, all enforced in `HseService.approvePermit` and all verified by the E2E suite as **409 refusals**:
  1. **Risk assessment** — the permit must cite one, and it must be `approved`. Authorising work whose hazards were never signed off is the failure the control exists to prevent.
  2. **Segregation of duties** — the requester may not approve their own permit.
  3. **Validity window** — a permit outside its own window cannot be issued.
- **Incident investigation** is a real lifecycle (`hse-incident.ts:26`): `reported → investigating → closed`, root cause mandatory, and **closure is refused while corrective actions raised against the incident are still open** — the same shape of gate as the commissioning punch list. Unlike a permit, an incident *can* be reopened: new evidence about a past accident must not force a second, disconnected record.
- **Permit 360** (`/hse/permits/[id]`) shows the three gates **before** the user clicks approve, naming the failing one. The disabled button is a convenience; the service is the control.
- **Residual:** the risk-assessment lifecycle itself is still thin (`draft → approved → expired`, no rejection path), and observations/inspections remain CRUD.

## Fleet — `VERIFIED_IMPLEMENTED` (Rev 2.3)

> **Rev 2.3.** The last module under G-08. Fleet was the *least* bad of the three: `assignFine`/`disputeFine`/`payFine` already carried ad-hoc guards. What it lacked was a way **out** of `disputed`.

- **The dead end.** Nothing could leave `disputed`: a contested fine could never be recovered if the dispute was rejected, nor written off if it succeeded. The register slowly filled with fines nobody could action, while still counting toward outstanding exposure.
- `FINE_TRANSITIONS` (`modules/fleet/src/domain/traffic-fine.ts:25`) now defines both exits — `disputed → pending` (liability stands; the driver assignment is cleared, since the dispute was about who owed it) and `disputed → cancelled` (authority waived it; terminal).
- **Cancelled fines leave the outstanding-exposure figure and stop carrying black points**, which they did not before.
- The pre-existing guards were rephrased **"can only"** so a state conflict classifies **409** under the error taxonomy rather than 400 — they were previously reported as validation failures.
- Covered by `asset-amc-fleet-workflow.e2e-spec.ts` and driven through the UI in `amc-asset-fleet.spec.ts`.
- **Residual:** vehicle status (`active|maintenance|retired`) is still a plain field — a vehicle in maintenance can still be dispatched. Salik charge allocation is likewise ungoverned. Neither blocks a journey, so both are tracked here rather than under G-08.

## Findings

- **Projects remains the strongest of the "deliver" half** — real EVM and cost/quantity ledgers.
- **Rev 2 reverses Rev 1's central finding for four of five modules.** Engineering, doc-control, site and QA/QC are no longer "data-rich but workflow/UI-thin": each has an enforced state machine, child-record depth, a completable in-app journey, and browser E2E driving that journey. A paperless engineering/site operation is now supportable in the UI for these stages.
- **Rev 2.2: HSE, the one exception, has now moved too.** Every delivery-half stage from engineering through commissioning — including the safety controls that authorise work — is governed, surfaced and E2E-covered.
- Rev 1's priority ("surface the existing data models with real workflow UIs", `22` P1.7) is **delivered**.

**Scores (re-estimates from merged source, not a live benchmark):** Projects 70 (unchanged) · Engineering 52→**68** · Doc-control 52→**66** · Site 58→**68** · QA/QC 58→**68** · **HSE 50→68 (Rev 2.2)** · **Fleet 50→62 (Rev 2.3)**.

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

## Engineering & Document Control — `PARTIALLY_IMPLEMENTED`

- **Model depth, UI near-zero.** Engineering: 7 Postgres stores (drawings/submittals/transmittals/RFIs implied) but **1 controller and 1 web page**. Doc-control: 5 stores, 1 controller, 1 page.
- Reactor `engineering.document.submitted` (`03` #9) wires submittals to doc-control.
- **Gap:** revision history, transmittal registers, submittal approval workflows exist as data but lack a completable UI journey. Document control is **not yet "enterprise-grade" in the UX**, though the data model supports it.

## Site execution — `PARTIALLY_IMPLEMENTED`

- Events: `site.installation.recorded`, `site.labour.logged`, `site.plant.logged`, delay logs. These feed progress + actual cost (reactors 19, 21, 22).
- 1 controller, 3 pages, 5 tests. Daily-report/site-diary depth is thin in the UI.

## QA / QC — `PARTIALLY_IMPLEMENTED`

- 8 Postgres stores (ITP/inspection/NCR implied), 1 controller, **7 pages**, 4 tests.
- Reactor `quality.ir.approved` gates progress (reactor 20).
- **Gap:** corrective-action lifecycle and evidence/photo traceability not verified end-to-end; service layer thin (1 `*.service.ts`).

## HSE — CRUD-level (`PARTIALLY_IMPLEMENTED`)

- 1 store, 1 controller, 3 pages, 4 tests. Incidents/observations/permits as CRUD; no verified risk-assessment or permit-to-work workflow engine.

## Findings

- **Projects is the strongest of the "deliver" half** — real EVM and cost/quantity ledgers.
- **Engineering, doc-control, QA/QC, HSE are data-rich but workflow/UI-thin.** They will not, today, support a paperless site/engineering operation end-to-end in the UI.
- Priority: surface the existing engineering/doc-control/QA data models with real workflow UIs (`22` roadmap P2).

**Scores:** Projects 70 · Engineering 52 · Doc-control 52 · Site 58 · QA/QC 58 · HSE 50.

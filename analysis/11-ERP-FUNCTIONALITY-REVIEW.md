# ERP Functionality Review

> **Completeness % is an estimate** derived from measured surface (backend files, migrations, web pages, endpoints) cross-checked against the module's expected ERP scope and this repo's own operating reports. It is *not* a measured functional score — per the project's report-integrity rule, treat these as informed judgments, not audited metrics. A live journey run (see [`13-WORKFLOW-ANALYSIS.md`](13-WORKFLOW-ANALYSIS.md)) is the only way to get true scores.

## Portfolio at a glance

| Module | Backend files | Migrations (approx) | Web pages | Est. completeness | Tier |
|---|---:|---:|---:|---:|---|
| CRM | 98 | 8+ | 19 | **~85%** | Reference-grade |
| Finance | 102 | 25+ | 21 | **~80%** | Reference-grade |
| Projects | 55 | 6 | 5 | ~65% | Strong backend, thin UI |
| Tendering | 53 | 3 | 4 | ~70% | Strong |
| Procurement | 34 | 4 | 7 | ~65% | Solid |
| HR | 36 | 8 | 9 | ~65% | Solid |
| Contracts | 30 | 5 | 5 | ~65% | Solid |
| Inventory | 24 | 5 | 6 | ~60% | Solid |
| Engineering | 36 | 1 | **1** | ~40% | Backend-only |
| Doc Control | 25 | 2 | **1** | ~40% | Backend-only |
| Quality | 24 | 3 | 3 | ~50% | Partial |
| HSE | 16 | 2 | 2 | ~45% | Partial |
| Assets | 16 | 2 | 2 | ~50% | Partial |
| Site | 16 | 2 | 2 | ~45% | Partial |
| Fleet | 15 | 3 | 3 | ~55% | Partial |
| AMC | 13 | 3 | 2 | ~50% | Partial |
| Subcontracts | 13 | 4 | 4 | ~60% | Solid |
| Market Intelligence | 9 | — | — | ~20% | WIP (this branch) |
| Intelligence/AI | 41 | 3 (0193–95) | ~5 admin | ~55% (ambition ≫ maturity) | Expanding fast |

## Module deep-dives

### CRM — ~85% (reference-grade)
- **Purpose:** Lead→Opportunity→Quotation commercial engine + accounts/contacts/forecast/pipeline/my-day.
- **Strengths:** event-sourced; forecast snapshots + slippage diff; commercial baselines locked on approval; pursuit scoring; deal health from 4 signals; account growth reactors (win→delivered→new signal, full acquisition loop); cockpit UIs (portfolio, pipeline command, 360 shells).
- **Weaknesses:** quotation *engine* still not fully unified (memory: two pricing sheets); relationship-intelligence depth uneven.
- **Missing:** email/comms integration depth (MS Graph decided, not fully wired); marketing/campaign layer.

### Finance — ~80% (reference-grade)
- **Purpose:** GL, AP/AR, invoices, tax, budgets, period close, cost/profit centers, PDCs, bank rec, guarantees.
- **Strengths:** **DB-enforced double-entry** (mig 0050); tax engine (0048); period closes (0081); multi-currency (customer/AP invoice currency migs); bank reconciliation; petty cash; staff advances.
- **Weaknesses:** consolidation/inter-company depth; fixed-asset↔GL integration; cashflow forecasting is project-side.
- **Missing:** full financial statements (P&L exists via projections; balance sheet/cashflow statement maturity unclear); audit-ready reporting pack.

### Projects — ~70% *(was ~65% — 2026-08-01 update)*
- WBS/CBS, variations, schedules, cashflow forecasts, closeouts. Execution lifecycle + closeout→contract.completed reactor.
- **2026-08-01 update — a real Delivery/PM Portfolio Cockpit shipped.** New `GET projects/projects/portfolio` composes **Earned-Value** (SPI/CPI, planned/earned/actual, cost & schedule variance) across all projects in one call; `/projects/dashboard` was upgraded from a status-count widget to a cockpit: portfolio KPIs (value, completion, portfolio SPI/CPI), an **at-risk callout** (active projects with SPI or CPI < 1), and a per-project health table. Verified against the live API (15 projects with EVM). Remaining PM gaps: an interactive Gantt (the `/projects/schedule` page exists but is basic) and resource loading.

### Tendering — ~70%
- Lifecycle, BOQ (Excel import productionized), submissions, risk layer, register depth. Bid review + vendor comparison (T6) was the last piece. **Strong domain, 4 pages** — needs an estimator's workspace UI.

### Procurement — ~65%
- PR→RFQ→PO, suppliers, PO↔supplier FK. Good spine. **Missing:** supplier portal, goods-receipt matching UI depth, 3-way match surfacing, spend analytics.

### HR — ~65%
- Employees, timesheets, attendance, expenses, advances, WPS (UAE SIF). Good UAE-specific depth. **Missing:** payroll run UI, leave management, org chart, performance/appraisal.

### Contracts — ~65%
- Contract 360, bonds/guarantees, payment certificates, obligations, clauses. Solid. **Missing:** contract authoring/templating UI depth, variation↔contract value automation.

### Inventory — ~68% *(was ~60% — 2026-08-01 update)*
- GRN, stock, transfers, valuation, reorder levels.
- **2026-08-01 update — serial/batch tracking added** (the thinnest domain's biggest ELV gap). New `SerialUnit` aggregate + `/inventory/serials` UI: register a serialised unit (unique per tenant+item), then track it in_stock → issued (to project) → installed (with warranty clock) → returned/faulty, with a status filter. Migration 0199 (RLS + unique-serial index). Verified E2E incl. the install-only-from-issued (409) and duplicate-serial (400) guards. **Still missing:** warehouse/bin locations, barcode/mobile picking, cycle counting.

### Engineering — ~60% *(was ~40% — 2026-08-01 update)*
- **2026-08-01 update — all seven backend domains now surfaced.** The Engineering page is now a full 7-tab cockpit (Overview + Shop Drawings, RFIs, Technical Submittals, Technical Queries, Design Changes, Documents, BIM Models). The two previously backend-only domains were wired end-to-end and verified against the running API: **Technical Queries** (raise → respond, open→responded) and **BIM Models** (register → version, v1→v2/Rev bump), each with client proxy routes and `EmptyState` on empty lists. Remaining gaps that keep it below ~80%: material take-off from BOQ, drawing↔submittal↔RFI cross-linking, an actual model *viewer* (the registry is the backbone; the 3D viewer is not built), and per-record detail pages.
- Original finding: substantial domain model, almost no UI — was the highest UI-vs-backend gap in the product; that specific gap is now largely closed.

### Doc Control — ~60% *(was ~40% — 2026-08-01 update)*
- **2026-08-01 update — the controlled Drawing/Document Register is now surfaced.** The register backend (`register` + `revise` + `history`) was previously built but exposed nowhere; `/documents/control` now has a **Drawing Register tab** (create · revision control · status lifecycle · distribution/transmittal history) alongside the existing transmittals + correspondence logs, and submittals remain at `/doccontrol/submittals`. Verified E2E (create Rev A → revise Rev B/for-construction → history). Remaining: bulk import, distribution-matrix editing, and document-file attachment via DMS.

### Quality — ~50%
- ITPs, material approvals, calibrations. **Missing:** inspection request (IR) workflow UI, NCR management, snag lists — core construction QA.

### HSE — ~45%
- Toolbox talks, incidents. **Missing:** permit-to-work, observation cards, audit/inspection UI, incident investigation workflow.

### Site — ~45%
- Site instructions, delay logs. **Missing:** daily site reports, labor/plant returns, progress photos, site diary — the field foreman's daily tools.

### Assets — ~50%
- Tags, depreciation, disposal, maintenance/inspection domain. **Missing:** asset lifecycle UI, QR/barcode, condition monitoring — important for ELV installed-base + AMC.

### Fleet — ~55%
- Vehicles, traffic fines, Salik (UAE). Good local fit. **Missing:** maintenance scheduling UI, fuel/telematics, driver assignment.

### AMC — ~60% *(was ~50% — 2026-08-01 update)*
- AMC contracts, PPM schedules, work-order costing.
- **2026-08-01 update — the field-service loop now has an operational UI.** New `/amc/dispatch` board (columns Open → Assigned → In progress → Completed) over the existing backend: raise a work order, **assign a technician**, **complete on site with a billable cost** (drives the AMC → AR invoice reactor), and a **technician filter** for a per-engineer view. Verified E2E (create → assign → complete → dispatch-board). **Still missing:** a true technician **mobile/PWA** with offline + on-site checklist/photos and customer e-signature.

### Subcontracts — ~60%
- Subcontracts, variations, back-charges, retention release. Reasonable. **Missing:** subcontractor portal, progress claims workflow UI.

### Intelligence / AI — ~55% ambition-adjusted (immature)
- **Ambition:** agent runtime, marketplace, SDK, model router, guardrails, vector store, digital twin, process mining, MCP server, saas credit billing, revenue/management agents.
- **Reality:** 4 tests; large uncommitted surface; violates the stated read-only law by owning persistence. Impressive scope, low maturity/governance. See [`02-ARCHITECTURE-REVIEW.md`](02-ARCHITECTURE-REVIEW.md) §5.

## Cross-cutting ERP gaps
1. **Delivery-side UI cliff** — the modules that make this a *construction/ELV* ERP (engineering, site, quality, HSE, doc control, AMC field service) are the thinnest in UI.
2. **No field/mobile app** — technicians and site staff have no surface built for them.
3. **Reporting/BI** — dashboards exist per module; a unified report builder / Analytics OS is planned (memory: Phase 6) but not shipped.
4. **Master data management** — items/materials catalog, cost libraries, rate databases are implied but not surfaced as a governed MDM.

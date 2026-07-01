# AURA OS — Per-Module Depth Analysis (2026-06-30)

> Module-by-module depth, measured from the live tree (domain entities · services · Postgres
> stores · test files) plus a source-verified capability read. Companion to
> `2026-06-30-depth-analysis-current-state.md` (the whole-system re-score). "Depth %" is an
> engineering-judgment estimate of delivered vs intended business surface for that module.
>
> **Persistence note:** every module now has a Postgres adapter (AMC was the last in-memory-only
> one — fixed this session). Two store shapes are in use: **per-entity stores** (finance, projects,
> procurement, crm, inventory — granular) and a **single aggregate store** per module (hr, quality,
> fleet, site, hse, assets, subcontracts, doccontrol, engineering — one store persists all the
> module's entities). Both are valid; the latter is leaner but coarser.

---

## Measured structure

| Module | Domains | Services | PG stores | Tests | Depth | Persistence |
|---|--:|--:|--:|--:|--:|---|
| **finance** | 16 | 13 | 13 | 17 | **~80%** | per-entity ✅ |
| **projects** | 5 | 5 | 5 | 7 | ~50% | per-entity ✅ |
| **procurement** | 5 | 4 | 4 | 5 | ~65% | per-entity ✅ |
| **crm** | 2(+shared) | 4 | 4 | 3 | ~65% | per-entity ✅ |
| **inventory** | 3 | 3 | 3 | 3 | ~65% | per-entity ✅ |
| **hr** | 9 | 1 | 1 | 7 | ~70% | aggregate store |
| **contracts** | 2 | 2 | 2 | 3 | ~68% | per-entity ✅ |
| **tendering** | 2 | 1 | 2 | 2 | ~65% | per-entity ✅ |
| **amc** | 4 | 1 | 2 | 3 | ~55% | ✅ (fixed this session) |
| **subcontracts** | 4 | 1 | 1 | 3 | ~60% | aggregate store |
| **quality** | 5 | 1 | 1 | 3 | ~60% | aggregate store |
| **fleet** | 5 | 1 | 1 | 3 | ~62% | aggregate store |
| **hse** | 4 | 1 | 1 | 2 | ~58% | aggregate store |
| **site** | 4 | 1 | 1 | 2 | ~58% | aggregate store |
| **assets** | 4 | 1 | 1 | 2 | ~60% | aggregate store |
| **doccontrol** | 3 | 1 | 3 | 2 | ~58% | per-entity ✅ |
| **engineering** | 3 | 1 | 3 | 1 | ~52% | per-entity ✅ |

---

## Per-module read + top gap

**finance (~80%, deepest).** 16 domains: GL/journals (now company-tagged), AP+AR invoices, payments, tax/VAT, petty cash, bank-rec, bank guarantees, post-dated cheques + this session's statements, period-close, budgets, revenue-recognition, FX. 17 test files. *Top gap:* intercompany elimination; multi-currency at transaction level (FX is rate-registry only).

**projects (~50%).** WBS, CBS, EVM, delay/EOT, variations; CBS auto-seeded from tender BOQ; rev-rec consumes EVM. *Top gap:* Gantt/baseline schedule, resource levelling, project close-out, cash-flow forecast — the audit's biggest still-open PM surface.

**procurement (~65%).** PR→RFQ→PO, supplier master, **approval matrix + issue gate** (this session). *Top gap:* PO↔supplier-master FK, framework/blanket agreements, server-side 3-way match.

**crm (~65%).** Accounts, leads, opportunities (now account-linked), quotations; drives the deal chain. *Top gap:* contacts entity, activities/tasks, email integration.

**inventory (~65%).** GRN, stock + movements, transfers, **WAC valuation + COGS + reorder** (PR #12). *Top gap:* FIFO layers, barcode, multi-UOM.

**hr (~70% breadth, monolithic).** 9 domains (employees, leave, payroll, EOSB, timesheets, claims, advances, doc-expiry, attendance) on a single service+store, 7 tests. *Top gap:* WPS (UAE SIF) file, appraisal, org chart; split the aggregate store as it grows.

**contracts (~68%).** Contracts + IPC payment certificates (ipc.certified → AR). *Top gap:* clause library, obligations tracking.

**tendering (~65%).** Tenders + BOQ (feeds CBS). *Top gap:* bid scoring, estimate cost build-up, competitor analysis.

**amc (~55%).** Contracts, work orders, tickets/SLA, PPM — **now Postgres-persisted** (was the single biggest persistence risk). *Top gap:* AMC→Finance billing link (PPM/visit → invoice).

**subcontracts (~60%).** Subcontracts, claims, variations, back-charges (→ AP debit note). *Top gap:* retention-release UI, formal back-charge approvals.

**quality (~60%).** NCR, inspection requests, snags, ITP, MAR (PR #12). *Top gap:* calibration register, audit schedule.

**fleet (~62%).** Vehicles, fuel, maintenance, traffic fines, Salik/tolls (PR #12). *Top gap:* GPS telematics, cost-per-km analytics.

**hse (~58%).** Incidents, PTW, CAPA, toolbox talks. *Top gap:* risk assessments, training matrix, audits.

**site (~58%).** Daily diaries, delay logs, material consumption, site instructions. *Top gap:* labour-by-trade, progress %.

**assets (~60%).** Register, maintenance, inspections, depreciation. *Top gap:* disposal/GL posting, QR tagging.

**doccontrol (~58%).** Transmittals, correspondence, submittals (A/B/C/D). *Top gap:* drawing register, distribution matrix.

**engineering (~52%, thinnest).** Drawings, RFIs, submittals; **only 1 test file** — lowest assurance. *Top gap:* MAR/TQ, model viewer, more tests.

---

## Cross-cutting observations

1. **Persistence is now uniform** — no in-memory-only module remains (AMC fixed). The split is per-entity vs single-aggregate store; the aggregate-store modules (hr especially, at 9 entities) are the natural next candidates to refactor for granularity.
2. **Test depth is uneven.** finance (17), projects/hr (7) are well covered; **engineering (1)**, hse/site/assets/doccontrol (2) are the thin spots — assurance risk concentrated in the L2 "operational" modules.
3. **The deal-chain + operate-loop modules (crm→tendering→contracts→projects, procurement→inventory→finance) are the deepest and most wired** (events, snapshots, reactor automation). The standalone vertical modules (hse, site, quality, doccontrol, engineering) are functional CRUD at ~55–60% with less cross-module wiring.
4. **Highest-value next module work:** projects (Gantt/baseline/close-out — the largest remaining PM gap), then engineering (depth + tests), then AMC billing link.

*Source-verified against the working tree, 2026-06-30. Depth % is engineering judgment, not a measured metric.*

# AURA OS — Master Due-Diligence · ADDENDUM (Matrices + under-reviewed areas)

**Date:** 2026-07-01 · Companion to `2026-07-01-master-due-diligence.md`. Adds the five executive matrices and the 10 areas the first pass under-covered. All source-verified. No code modified.

---

## A. UI Completeness — pages present vs missing (per module)

"Standard ERP set" per module = List · Create/Edit · Detail · **Dashboard** · **Print/PDF** · **Export** · **Charts**.

| Module | Pages now | Has List+Form+Detail | Dashboard | Print/PDF | Export | Charts |
|---|--:|:--:|:--:|:--:|:--:|:--:|
| Finance | 16 | ✅ | ❌ | ❌ | ❌ | ❌ |
| HR | 7 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Procurement | 4 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Inventory | 4 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Projects | 2 | ◐ | ❌ | ❌ | ❌ | ❌ |
| CRM | 3 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Quality / Fleet / Subcontracts | 3 each | ✅ | ❌ | ❌ | ❌ | ❌ |
| Contracts / Tendering / Assets / HSE / Site / AMC | 2 each | ◐ | ❌ | ❌ | ❌ | ❌ |
| Engineering / Doc-Control | 1 each | ❌ | ❌ | ❌ | ❌ | ❌ |

**Verified:** 68 pages total; **0 module dashboards**, **0 print/PDF**, **0 export**, **0 chart library** (only 2 files touch PDF, both non-document; ~10 inline `<svg>`, no charting lib). **Print/Export is the single largest UI/ERP gap.**

---

## B. Feature Matrix (major capabilities)

✅ complete · ◐ partial · ❌ absent

| Feature | Status | Feature | Status |
|---|:--:|---|:--:|
| Double-entry GL | ✅ | Financial statements (P&L/BS/CF/TB) | ✅ |
| Period close | ✅ | Budgeting + vs-actual | ✅ |
| Revenue recognition (IFRS-15) | ✅ | Cost centres / Profit centres | ✅ |
| Multi-currency (AR) | ◐ | Multi-currency (AP/GL) | ❌ |
| Intercompany elimination | ❌ | Consolidation | ❌ |
| AP/AR + aging | ✅ | PDC / Bank guarantees / VAT | ✅ |
| P2P (PR→RFQ→PO→GRN→3-way) | ✅ | Approval matrix | ✅ |
| Supplier master + approved-vendor FK | ✅ | Inventory WAC + COGS→GL | ✅ |
| Reorder → auto-PR | ✅ | Inventory FIFO / batch / serial | ❌ |
| Deal chain automation | ✅ | IPC progress billing | ✅ |
| Project EVM | ✅ | Gantt / baseline schedule | ❌ |
| Cash-flow forecast | ✅ | Project closeout + DLP | ✅ |
| Warranty/DLP claim workflow | ❌ | Subcontract back-charges→AP | ✅ |
| HR payroll + EOSB | ✅ | WPS SIF | ✅ |
| Attendance | ✅ | Appraisal / org chart | ❌ |
| AMC persisted + PPM + →AR billing | ✅ | Quality ITP/MAR | ✅ |
| Fleet fines + Salik | ✅ | Print/PDF documents | ❌ |
| Dashboards / BI | ❌ | Notifications (email/SMS) | ❌ |
| Global search (⌘K) | ✅ | Saved views / advanced filters | ❌ |

---

## C. Workflow Matrix (end-to-end completeness)

| Workflow | Chain | % | Break point |
|---|---|--:|---|
| Order-to-Cash (deal chain) | Lead→Opp→Quote→Tender→Contract→Project→AR | 90% | Quotation→Tender not auto |
| Procure-to-Pay | PR→RFQ→PO→GRN→3-way→AP invoice→Payment→GL | 90% | Cash-flow/reporting downstream |
| Vendor-invoice→Statements | AP invoice→approve→3-way→payment(Dr AP/Cr Bank)→GL→bank-rec→statements | 85% | No auto Dr-expense/Cr-AP on approval; rec partial |
| Record-to-Report | Journal→period-close→statements/cost+profit centre/budget | 90% | No consolidation/intercompany |
| Inventory perpetual | Receipt→WAC→issue→COGS→GL; reorder→PR | 95% | GRNI clearing on AP invoice |
| HR Hire-to-Pay | Employee→leave→attendance→payroll→WPS→EOSB | 85% | Leave-balance accrual; payroll not auto-fed by attendance |
| Service (AMC) | Contract→PPM→WO→complete→AR invoice | 90% | SLA timers shallow |
| Project lifecycle | Setup→WBS/CBS→EVM→variations→closeout→DLP | 80% | No Gantt/baseline; warranty claims |

---

## D. Reports & Dashboards Matrix

| Report | State | Report | State |
|---|:--:|---|:--:|
| Trial balance | ✅ data | P&L / Balance Sheet / Cash Flow | ✅ data |
| AR aging / AP aging | ✅ data | VAT return | ✅ data |
| Cost-centre / Profit-centre actuals | ✅ data | Budget vs actual | ✅ data |
| Revenue recognition | ✅ data | Project EVM | ✅ data |
| Cash-flow forecast (S-curve) | ✅ data | Depreciation schedule | ✅ data |
| Inventory valuation / reorder | ✅ data | Salik / fines summary | ✅ data |
| Delay analysis | ✅ data | KPI / executive dashboard | ❌ |

**Verified:** reports exist as **JSON data endpoints only** — **0 printable/exportable reports, 0 visual dashboards, 0 charts**. Every "✅ data" needs a presentation layer (table→chart, print, export).

---

## E. Permissions Matrix

| Aspect | Finding |
|---|---|
| Permission strings defined | **71** distinct (`module.entity.action`) |
| Enforcement style | `access.assert()` **inside services**, gated on a real actor |
| Controller decorators (`@Permissions`) | **0** — no per-route declarative guard |
| Per-action coverage | Partial: create/approve paths assert; **list/get/export/print largely unguarded** |
| Default path | Keyless dev path skips asserts entirely (auth off) |
| Verdict | Engine is real; **coverage is inconsistent and unenforced by default** |

---

## F. ERP Benchmark Matrix (vs Tier-1 / Odoo)

✅ strong · ◐ partial · ✗ absent

| Capability | SAP S/4 | Oracle | Dynamics 365 | Odoo | **AURA** |
|---|:--:|:--:|:--:|:--:|:--:|
| GL + statements + period close | ✅ | ✅ | ✅ | ✅ | ✅ |
| Budget / rev-rec / cost+profit centres | ✅ | ✅ | ✅ | ◐ | ✅ |
| Multi-currency + consolidation | ✅ | ✅ | ✅ | ✅ | ◐ (AR only) |
| Intercompany | ✅ | ✅ | ✅ | ◐ | ✗ |
| P2P + 3-way + approval matrix | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventory valuation | ✅ FIFO/WAC/std | ✅ | ✅ | ✅ | ◐ WAC only |
| Project costing / EVM | ✅ | ✅ | ◐ | ◐ | ✅ |
| Gantt / scheduling | ✅ | ✅ | ✅ | ✅ | ✗ |
| Construction vertical (IPC/ITP/subcontract/WPS) | ◐ | ◐ | ✗ | ✗ | ✅ **edge** |
| Document print/output mgmt | ✅ | ✅ | ✅ | ✅ | ✗ |
| BI / dashboards | ✅ | ✅ | ✅ | ◐ | ✗ |
| Reporting/export engine | ✅ | ✅ | ✅ | ✅ | ✗ |
| Workflow designer | ✅ | ✅ | ✅ | ✅ | ✗ |
| AI (extraction/forecast/assistant) | ✅ | ✅ | ✅ | ◐ | ✗ |
| Mobile / portals | ✅ | ✅ | ✅ | ✅ | ✗ |
| RBAC admin UI / localization | ✅ | ✅ | ✅ | ✅ | ✗ |

**Read:** AURA matches Tier-1 on **finance depth + construction vertical**; trails on **output (print/BI), scheduling, AI, mobile/portals, admin/i18n, consolidation**.

---

## G. AI Reality Check (the "AURA" namesake)

| Expected AI feature | In code | Status |
|---|---|:--:|
| Provider seam (Claude/OpenAI) | `core/ai` + `@anthropic-ai` dep; **LOCAL fallback unless key set** | ◐ config-gated |
| Auto BOQ / Auto Tender | — | ❌ |
| Invoice/Document extraction (OCR) | none | ❌ |
| Forecast / cash prediction | heuristic `process-mining`/`pricing`, not ML | ◐ heuristic |
| Risk / schedule prediction | none | ❌ |
| RAG over docs | `vector-store` = lexical (pgvector migration exists, unused) | ◐ toy |
| Assistant / copilot | `mcp-server` = protocol shell, no business tools | ◐ scaffold |
| Autonomy / guardrails | rule-based threshold engine | ◐ heuristic |

**Verdict:** AI is **honest scaffolding + heuristics**; **0 productized AI features**, **0 model calls by default**. AI usefulness ≈ 20%.

---

## H. Performance (assessed from code; not load-tested)

| Aspect | Finding |
|---|---|
| Queries / indexes | `(tenant_id)`/`(tenant_id,status)`/FK indexes present; no composite/partial tuning |
| N+1 | Journal `list()` loops a lines-query per journal; aging/EVM/statements aggregate in-app |
| Pagination | Contract exists, applied in ~9 files only → unbounded scans elsewhere |
| Caching | None |
| Connection pool | Single `pg` pool; no pgBouncer/replica |
| Large dataset / CPU / memory / response-time | **Unmeasured** — no APM/load test |

---

## I. Revised Scoring (engineering completion corrected)

The first pass undercounted feature breadth. With statements, budgeting, rev-rec, cost/profit centres, WPS, attendance, valuation, 3-way match, approval matrix, closeout, deal automation, 12 reactors, 18 modules, 384 endpoints, 212 tests verified present:

| Dimension | Prior | Revised | Basis |
|---|--:|--:|---|
| Feature/Engineering completion | 68% | **~76%** | breadth+depth verified; output/AI/scheduling still missing |
| Production readiness | 20% | 20% | no CI/Docker/RLS-enforced/observability/backups |
| Commercial readiness | 45% | 45% | no print/BI/portals/mobile |

Production (20%) and Commercial (45%) are **confirmed unchanged** — feature richness does not offset missing ops/security or the missing output/UX layer.

---

## J. New gaps surfaced by this addendum

| # | Gap | Priority |
|---|---|--:|
| A | Document output engine — print/PDF/Excel for Invoice, PO, GRN, IPC, Contract, Payroll | **P1** |
| B | Module + executive dashboards with charts (EVM, aging, cash-flow S-curve, KPIs) | **P1** |
| C | Reporting/export layer over the existing JSON report endpoints | **P1** |
| D | Per-route permission enforcement (`@Permissions` on every controller action incl. export/print) | **P1** |
| E | Real AI features (OCR/invoice extraction, forecasting on data, assistant, pgvector RAG) | **P2** |
| F | Saved views / advanced filters | P2 |
| G | Performance baseline (APM + load test + N+1/pagination fixes) | P2 |

These are **additive** to the master report's P0–P3 list (security/ops P0 still dominate).

---

*Source-verified 2026-07-01. Together with the master report, this is the current single source of truth.*

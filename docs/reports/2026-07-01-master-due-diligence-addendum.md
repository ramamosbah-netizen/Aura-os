# AURA OS — Master Due-Diligence · ADDENDUM (Matrices + under-reviewed areas)

**Date:** 2026-07-01 (rev 9) · Companion to `2026-07-01-master-due-diligence.md`. Adds the five executive matrices and the 10 areas the first pass under-covered. All source-verified.

**rev 9:** AP multi-currency + FX revaluation posting landed (Tier-1 #8 closed). AP invoices carry currency/exchangeRate/baseValue (migration 0096); reval posts unrealized gain/loss to GL (AP credit-normal: rate↑ = loss Dr 5900/Cr 2010, rate↓ = gain Dr 2010/Cr 4900) via `GET/POST /finance/invoices/fx-revaluation[/post]`. Multi-currency (AP/GL) now ✅.

**Rev-7 change:** **gap F (saved views) closed** — SavedViewService + `/views` + `☆ Save view` on lists (migration 0093, `fb54cf9`).
**Rev-6 (prior):** **gap H (UI Gantt) closed** — `/projects/schedule` renders planned vs baseline vs actual-% bars.
**Rev-2–5 (prior):** document/print engine (9 docs) → gap A ✅; 5 dashboards → gap B ✅; CSV export on 9 lists → gap C ✅.

---

## A. UI Completeness — pages present vs missing (per module)

"Standard ERP set" per module = List · Create/Edit · Detail · **Dashboard** · **Print/PDF** · **Export** · **Charts**.

| Module | Pages now | Has List+Form+Detail | Dashboard | Print/PDF | Export | Charts |
|---|--:|:--:|:--:|:--:|:--:|:--:|
| Finance | 16 | ✅ | ❌ | ◐ invoice | ❌ | ❌ |
| Procurement | 4 | ✅ | ❌ | ◐ PO | ❌ | ❌ |
| Inventory | 4 | ✅ | ❌ | ◐ GRN | ❌ | ❌ |
| Contracts | 2 | ◐ | ❌ | ◐ IPC | ❌ | ❌ |
| Projects | 2 | ◐ | ❌ | ❌ | ❌ | ❌ |
| HR / CRM / Quality / Fleet / Subcontracts | 3–7 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tendering / Assets / HSE / Site / AMC / Engineering / Doc-Control | 1–2 | ◐ | ❌ | ❌ | ❌ | ❌ |

**Verified (rev 8):** print for **9 documents**; **5 dashboards**; **CSV export on 9 lists**; **UI Gantt**; **saved views** (`/views`). Remaining UI gaps: advanced-filter DSL, Excel export.

---

## B. Feature Matrix (major capabilities)

✅ complete · ◐ partial · ❌ absent

| Feature | Status | Feature | Status |
|---|:--:|---|:--:|
| Double-entry GL | ✅ | Financial statements (P&L/BS/CF/TB) | ✅ |
| Period close | ✅ | Budgeting + vs-actual | ✅ |
| Revenue recognition (IFRS-15) | ✅ | Cost centres / Profit centres | ✅ |
| Multi-currency (AR) | ✅ | Multi-currency (AP/GL) | ✅ |
| Intercompany elimination | ❌ | Consolidation | ❌ |
| AP/AR + aging | ✅ | PDC / Bank guarantees / VAT | ✅ |
| P2P (PR→RFQ→PO→GRN→3-way) | ✅ | Approval matrix | ✅ |
| Supplier master + approved-vendor FK | ✅ | Inventory WAC + COGS→GL | ✅ |
| Reorder → auto-PR | ✅ | Inventory FIFO / batch / serial | ❌ |
| Deal chain automation | ✅ | IPC progress billing | ✅ |
| Project EVM | ✅ | Gantt / baseline schedule | ✅ (data + UI) |
| Cash-flow forecast | ✅ | Project closeout + DLP | ✅ |
| Warranty/DLP claim workflow | ❌ | Subcontract back-charges→AP | ✅ |
| HR payroll + EOSB | ✅ | WPS SIF | ✅ |
| Attendance | ✅ | Appraisal / org chart | ❌ |
| AMC persisted + PPM + →AR billing | ✅ | Quality ITP/MAR | ✅ |
| Fleet fines + Salik | ✅ | Print/PDF (Invoice/PO/GRN/IPC) | ◐ 4 docs |
| Dashboards / BI | ❌ | Notifications (email/SMS) | ❌ |
| Global search (⌘K) | ✅ | Saved views / advanced filters | ◐ (saved views ✅; filter DSL ❌) |

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
| Project lifecycle | Setup→WBS/CBS→EVM→schedule/baseline→variations→cash-flow→closeout→DLP | 92% | Warranty claims |

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

**Verified:** reports still exist as **JSON data endpoints only** — **0 visual dashboards, 0 charts, 0 bulk export**. Document **print** now exists for Invoice/PO/GRN/IPC (not for these list reports). Every "✅ data" still needs a presentation layer (chart/print/export).

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
| Multi-currency + consolidation | ✅ | ✅ | ✅ | ✅ | ✅ (AR+AP, FX reval) |
| Intercompany | ✅ | ✅ | ✅ | ◐ | ✗ |
| P2P + 3-way + approval matrix | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventory valuation | ✅ FIFO/WAC/std | ✅ | ✅ | ✅ | ◐ WAC only |
| Project costing / EVM | ✅ | ✅ | ◐ | ◐ | ✅ |
| Gantt / scheduling | ✅ | ✅ | ✅ | ✅ | ✅ (data + UI) |
| Construction vertical (IPC/ITP/subcontract/WPS) | ◐ | ◐ | ✗ | ✗ | ✅ **edge** |
| Document print/output mgmt | ✅ | ✅ | ✅ | ✅ | ◐ (9 docs) |
| BI / dashboards | ✅ | ✅ | ✅ | ◐ | ◐ (5 dashboards) |
| Reporting/export engine | ✅ | ✅ | ✅ | ✅ | ◐ (CSV on 9 lists) |
| Workflow designer | ✅ | ✅ | ✅ | ✅ | ✗ |
| AI (extraction/forecast/assistant) | ✅ | ✅ | ✅ | ◐ | ✗ |
| Mobile / portals | ✅ | ✅ | ✅ | ✅ | ✗ |
| RBAC admin UI / localization | ✅ | ✅ | ✅ | ✅ | ✗ |

**Read:** AURA matches Tier-1 on **finance depth + construction vertical**; document print now partial; still trails on **BI/dashboards, export, UI Gantt, AI, mobile/portals, admin/i18n, consolidation**.

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
| N+1 | Journal `list()` **fixed** (batched `ANY($1)`); aging/EVM/statements still aggregate in-app |
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

| # | Gap | Priority | Status |
|---|---|--:|---|
| A | Document output engine (9 docs incl. Contract/Payslip/Statements) | P1 | ✅ **done** |
| B | Module + executive dashboards with charts | P1 | ✅ **done** — chart kit + Finance/Projects/Procurement/HR/Inventory dashboards |
| C | Bulk export (CSV) over list endpoints | P1 | ✅ **done** — ExportButton on 9 lists (stock, customer-invoices, attendance, salik, expense-claims, fines, staff-advances, suppliers, quotations); Excel/report-export optional |
| D | Per-route permission enforcement (`@Permissions` incl. export/print) | **P1** | open |
| E | Real AI features (OCR/invoice extraction, forecasting on data, assistant, pgvector RAG) | **P2** | open |
| F | Saved views / advanced filters | P2 | ◐ — saved views ✅ (`/views`); advanced-filter DSL open |
| G | Performance baseline (APM + load test + N+1/pagination fixes) | P2 | ◐ — journal N+1 fixed; APM/load-test/pagination-rollout open |
| H | UI Gantt render over the new schedule/baseline data | P2 | ✅ **done** — `/projects/schedule` (planned vs baseline vs actual-%) |

These are **additive** to the master report's P0–P3 list (security/ops P0 still dominate).

---

*Source-verified 2026-07-01. Together with the master report, this is the current single source of truth.*

# AURA OS — Master Due Diligence Report

**Date:** 2026-07-01  
**Source:** Codebase audit (sole source of truth)  
**Stack:** TypeScript · NestJS (API) · Next.js (Web) · PostgreSQL · pnpm monorepo · Turborepo

---

## 1. Architecture

### 1.1 Overall Architecture

| Aspect | Finding |
|---|---|
| **Pattern** | Modular monolith with event-driven cross-module communication |
| **Layers** | `shared` (types) → `core` (kernel) → `modules/*` (bounded contexts) → `apps/api` (NestJS host) + `apps/web` (Next.js shell) + `intelligence` (AI brain) |
| **Workspace** | pnpm workspaces + Turborepo for build orchestration |
| **Dependency direction** | Correct — modules depend on `core` and `shared`; never on each other |
| **Cross-module communication** | Via `EventBus` (in-process pub/sub) + `CrossModuleSubscriber` reactor in `apps/api` |

### 1.2 Module Boundaries

17 business modules, each as a standalone pnpm workspace package with own `src/domain/`, service, store interface, in-memory store, and Postgres store:

| # | Module | Package |
|---|---|---|
| 1 | CRM | `@aura/crm` |
| 2 | Tendering | `@aura/tendering` |
| 3 | Contracts | `@aura/contracts` |
| 4 | Projects | `@aura/projects` |
| 5 | Procurement | `@aura/procurement` |
| 6 | Inventory | `@aura/inventory` |
| 7 | Finance | `@aura/finance` |
| 8 | Subcontracts | `@aura/subcontracts` |
| 9 | Engineering | `@aura/engineering` |
| 10 | Document Control | `@aura/doccontrol` |
| 11 | Site | `@aura/site` |
| 12 | HSE | `@aura/hse` |
| 13 | Quality | `@aura/quality` |
| 14 | HR | `@aura/hr` |
| 15 | Fleet | `@aura/fleet` |
| 16 | Assets | `@aura/assets` |
| 17 | AMC | `@aura/amc` |

### 1.3 DDD / CQRS / Event Architecture

| Aspect | Status | Notes |
|---|---|---|
| Domain value objects | ✅ Implemented | `Money` (minor units), `Period`, `Quantity`, `Location`, `Address` in shared CDM |
| Event sourcing | ✅ Implemented | `PostgresEventStore` with transactional outbox pattern |
| Outbox relay | ✅ Implemented | Polling relay with `FOR UPDATE SKIP LOCKED`, dead-letter after max attempts |
| Command bus | ✅ Implemented | Idempotent command bus with lock service |
| CQRS read projections | ✅ Implemented | `ProjectionEngine` + `SnapshotEngine` + `OlapExportService` |
| Saga orchestrator | ✅ Implemented | Forward/compensate pattern with persistence |
| Event catalog | ✅ Defined | 60+ event types across all modules; self-healing registry for new types |

### 1.4 Architectural Strengths

- Clean dependency direction — no circular imports between modules
- Dual-store pattern (in-memory + Postgres) enables DB-free local dev
- Idempotent cross-module reactor prevents duplicate downstream records on event re-delivery
- Transactional outbox guarantees at-least-once event delivery

### 1.5 Architectural Concerns

| Finding | Severity |
|---|---|
| `CrossModuleSubscriber` (479 lines) is a monolith — all reactions in one class | P2 |
| Event bus is in-process only — no Kafka/NATS for true distributed scaling | P2 |
| No module-level API versioning — all modules share `/api/v1` | P3 |
| `intelligence` package reads from multiple module services directly (tight coupling) | P3 |

---

## 2. Backend

### 2.1 API Completeness

| Area | Endpoints | Status |
|---|---|---|
| Health | 1 | ✅ |
| Auth | 3 (status, login, dev-token) | ✅ |
| CRM Accounts | 4 (CRUD + paged) | ✅ |
| CRM Leads | Controller present | ✅ |
| CRM Opportunities | Controller present | ✅ |
| CRM Quotations | Controller present | ✅ |
| Tendering | Controller present | ✅ |
| Contracts | Controller + Payment Certificates | ✅ |
| Projects | 30+ (CRUD, WBS, CBS, delays, EOT, variations, closeout, cashflow, schedule) | ✅ |
| Procurement | 20+ (PO, PR, RFQ, suppliers, approval matrix) | ✅ |
| Inventory | 3 controllers (GRN, stock, transfers) | ✅ |
| Finance | 70+ endpoints across 6 controllers (invoices, journals, payments, bank recon, tax, petty cash, customer invoices, bank guarantees, PDC, cost/profit centers, statements, budget, revenue recognition, FX, period close) | ✅ |
| Subcontracts | Controller present | ✅ |
| Engineering | Controller present | ✅ |
| Document Control | Controller present | ✅ |
| Site | Controller present | ✅ |
| HSE | Controller present | ✅ |
| Quality | Controller present | ✅ |
| HR | Controller present | ✅ |
| Fleet | Controller present | ✅ |
| Assets | Controller present | ✅ |
| AMC | Controller present | ✅ |
| Intelligence / AI | Controller present | ✅ |
| Notifications | Controller present | ✅ |
| Audit | Controller present | ✅ |
| Search | Controller + service | ✅ |
| Saved Views | Controller present | ✅ |
| Builder | Controller present | ✅ |
| Events | Controller present | ✅ |
| Documents (DMS) | Controller present | ✅ |
| Workflow | Controller present | ✅ |
| Integration/Webhooks | Controller present | ✅ |
| Templates | Controller + service | ✅ |

**Total controllers registered: 41**

### 2.2 Validation

| Pattern | Status |
|---|---|
| DTO validation at controller level | ✅ Manual checks with `BadRequestException` |
| UUID param validation pipe | ✅ `ParseUuidOr404Pipe` exists |
| Class-validator / Zod schema validation | ❌ Not used — all validation is manual inline |
| Request body type safety | ⚠️ TypeScript interfaces only (no runtime enforcement) |

### 2.3 Error Handling

| Pattern | Status |
|---|---|
| `NotFoundException` for missing resources | ✅ Consistent |
| `BadRequestException` for validation failures | ✅ Consistent |
| `AccessDeniedFilter` (403 mapping) | ✅ Global exception filter |
| Domain errors caught and re-thrown as 400s | ✅ `try/catch` in controllers |
| Global unhandled exception filter | ❌ Missing — uncaught errors return raw 500 |

### 2.4 Pagination

| Pattern | Status |
|---|---|
| Offset-based pagination | ✅ `parsePageParams()` utility in shared |
| `/paged` variant endpoints | ✅ On CRM, procurement, finance, inventory, subcontracts |
| Cursor-based pagination | ❌ Not implemented |
| Default hard limit | ⚠️ Most list endpoints hard-coded to `limit: 100–200` |

### 2.5 Performance Patterns

| Pattern | Status |
|---|---|
| Circuit breaker | ✅ `CircuitBreaker` in core |
| Rate limiter | ✅ `RateLimiter` in core |
| Background jobs | ✅ `BackgroundJobService` in core |
| Lock service | ✅ Advisory locks for concurrent command protection |
| Connection pooling | ✅ `pg.Pool` |

---

## 3. Database

### 3.1 Schema & Migrations

- **96 migration files** covering all modules
- Linear, sequential numbering (`0001` → `0096`)
- All migrations are raw SQL (not an ORM migration tool)
- No migration runner beyond a custom `scripts/migrate.mjs`

### 3.2 Key Schema Tables

| Module | Tables |
|---|---|
| Kernel | events, documents, workflows, webhooks, numbering, audit, calendar, exchange rates, idempotency, projections, notifications, saved views |
| CRM | accounts, leads, opportunities, quotations |
| Tendering | tenders, BOQ (header + items) |
| Contracts | contracts, payment certificates |
| Projects | projects, WBS nodes, CBS nodes, delay events, EOT claims, variations, closeouts, cashflow forecasts, schedules |
| Procurement | purchase orders, purchase requests, RFQs, suppliers |
| Inventory | GRNs, stock items, stock movements, stock transfers, reorder levels |
| Finance | invoices (AP), customer invoices (AR), accounts (COA), journals + lines, payments, bank transactions, tax codes/lines/returns, petty cash, bank guarantees, PDC, cost centers, profit centers, budgets, period closes |
| Subcontracts | subcontracts, claims, retention releases, variations, back-charges |
| Engineering | drawings, RFIs, submittals |
| Document Control | transmittals, correspondence, submittals |
| Site | daily reports, delay logs, material consumption, site instructions |
| HSE | incidents, permits-to-work, CAPAs, toolbox talks |
| Quality | NCRs, inspection requests, snags, ITPs, material approvals |
| HR | employees, leaves, payroll runs, timesheets, attendance, expense claims, staff advances |
| Fleet | vehicles, fuel logs, maintenance, traffic fines, salik charges |
| Assets | assets, maintenance, inspections |
| AMC | contracts, tickets, work orders, PPM schedules |
| Intelligence | pricing history, autonomy decisions, builder platform, connector registry |
| Saga | saga instances + steps |

### 3.3 Constraints & Integrity

| Aspect | Status |
|---|---|
| Primary keys (UUID) | ✅ All tables |
| Foreign keys | ⚠️ Some FK constraints exist (e.g., `0084_procurement_po_supplier_fk`), but many cross-module references are denormalized strings |
| NOT NULL constraints | ✅ On required fields |
| CHECK constraints | ⚠️ Limited — mostly status ENUMs |
| Unique constraints | ✅ On codes, invoice numbers |
| Indexes | ⚠️ Primary key indexes only in most migrations; no explicit composite indexes for query patterns |
| Double-entry trigger | ✅ Migration `0050` enforces balanced journals at DB level |

### 3.4 Multi-Tenancy

| Aspect | Status |
|---|---|
| `tenant_id` column | ✅ On all business tables |
| `company_id` column | ✅ On most tables (multi-company) |
| RLS policies | ✅ Migration `0032` applies RLS to 37+ tables |
| Dynamic hierarchical RLS | ✅ Migration `0049` adds branch/project-scoped policies |
| Session-setting helpers | ✅ `current_tenant_id()`, `current_company_id()`, `current_branch_id()` |
| Application-level tenant binding | ✅ `TenantContext` (AsyncLocalStorage) + per-request middleware |

### 3.5 Database Concerns

| Finding | Severity |
|---|---|
| No explicit composite indexes for common query filters (tenant+status, tenant+project) | P1 |
| Many cross-module references stored as denormalized text (supplierName, projectName) rather than FK | P2 |
| No database-level cascading deletes defined | P2 |
| Migration runner is a custom script — no rollback support | P2 |
| No seed data migration for Chart of Accounts or initial setup | P3 |

---

## 4. Business Modules — Individual Review

### CRM (`@aura/crm`)

| Aspect | Status |
|---|---|
| Accounts (CRUD, status, paging) | ✅ |
| Leads (CRUD, qualification) | ✅ |
| Opportunities (CRUD, pipeline stages, win/loss) | ✅ |
| Quotations (CRUD, print template) | ✅ |
| Deal chain trigger (opportunity.won → tender) | ✅ Automated |
| Domain tests | ✅ crm.test.ts |
| **Gaps** | No contact/person entities; no activity logging; no email integration |

### Tendering (`@aura/tendering`)

| Aspect | Status |
|---|---|
| Tender CRUD + status lifecycle | ✅ |
| BOQ (bill of quantities) with items | ✅ |
| Bid/no-bid decision event | ✅ |
| Award → auto-create contract | ✅ Automated |
| Auto-numbering | ✅ Via NumberingService |
| Domain tests | ✅ tender.test.ts, boq.test.ts |
| **Gaps** | No multi-revision BOQ; no markup/margin calculations; no bid comparison matrix |

### Contracts (`@aura/contracts`)

| Aspect | Status |
|---|---|
| Contract CRUD + lifecycle | ✅ |
| Payment certificates (IPC) | ✅ Full vertical: create, certify, retention |
| Contract signed → auto-create project | ✅ Automated |
| IPC certified → auto-draft AR invoice | ✅ Automated |
| Domain model | ✅ contract.ts, payment-certificate.ts |
| **Gaps** | No contract amendments/addenda; no milestone-based billing |

### Projects (`@aura/projects`)

| Aspect | Status |
|---|---|
| Project CRUD + lifecycle | ✅ |
| WBS (work breakdown structure) | ✅ Hierarchical, with progress + spend tracking |
| CBS (cost breakdown structure) | ✅ With BOQ sync from tenders |
| EVM (earned value management) | ✅ Calculated from WBS |
| Delay analysis + EOT claims | ✅ Full vertical with concurrent delay detection |
| Variation orders (change orders) | ✅ CRUD + approval lifecycle |
| Project closeout | ✅ Checklist + DLP + handover |
| Cash-flow forecasts | ✅ Period-based with summary |
| Schedule (Gantt) | ✅ Task-based with baseline |
| Domain tests | ✅ 8 test files covering all sub-domains |
| **Gaps** | No resource allocation/leveling; no Primavera/MS Project import |

### Procurement (`@aura/procurement`)

| Aspect | Status |
|---|---|
| Purchase orders (CRUD, lifecycle, approval) | ✅ |
| Purchase requests | ✅ With multi-level approval |
| RFQ (request for quotation) | ✅ With vendor quotes + auto-recommend |
| Supplier master | ✅ CRUD + approve/suspend lifecycle |
| Approval matrix | ✅ Configurable level-based rules |
| PO → committed cost tracking | ✅ Event-driven |
| Domain tests | ✅ procurement.test.ts, purchase-order.test.ts, rfq.test.ts, supplier.test.ts, approval-matrix.test.ts |
| **Gaps** | No PO line items; no goods return (GRR); no blanket/framework agreements |

### Inventory (`@aura/inventory`)

| Aspect | Status |
|---|---|
| GRN (goods received notes) | ✅ CRUD + inspection |
| Stock items + movements | ✅ Full WAC valuation |
| Stock transfers (warehouse-to-warehouse) | ✅ |
| Reorder levels + auto-PR | ✅ Automated via event |
| FIFO costing model | ✅ Domain logic |
| Perpetual inventory GL posting | ✅ Automated (Dr Inventory/Cr GRNI, Dr COGS/Cr Inventory) |
| Domain tests | ✅ goods-receipt.test.ts, stock.test.ts, stock-transfer.test.ts, fifo.test.ts |
| **Gaps** | No batch/serial tracking; no multiple warehouses in schema; no cycle count |

### Finance (`@aura/finance`)

| Aspect | Status |
|---|---|
| Chart of accounts (COA) | ✅ Hierarchical with parent |
| Double-entry general ledger | ✅ DB trigger enforces balance |
| AP invoices | ✅ Full lifecycle |
| AR customer invoices | ✅ With line items, VAT, receipts, cancel |
| Payments + auto-GL posting | ✅ |
| Bank reconciliation | ✅ Import, auto-match, manual reconcile |
| VAT/tax engine | ✅ Tax codes, tax lines, inclusive/exclusive |
| VAT returns | ✅ Preview, generate, file, pay lifecycle |
| Petty cash | ✅ Fund management + transactions |
| Bank guarantees | ✅ Lifecycle (release, claim, expire) + expiry alerts |
| Post-dated cheques (PDC) | ✅ Full lifecycle (deposit, clear, bounce, represent, cancel) |
| Cost centers | ✅ CRUD + reporting |
| Profit centers | ✅ CRUD + reporting |
| Financial statements | ✅ P&L, balance sheet, trial balance, cash flow |
| Period close | ✅ Lock fiscal months |
| Budgets | ✅ Budget vs actual from GL |
| Revenue recognition | ✅ IFRS-15 %-complete per project |
| Multi-currency (FX) | ✅ Exchange rates + FX revaluation |
| AP/AR aging | ✅ Bucketed aging reports |
| Group consolidation | ✅ Per-company + consolidated |
| P&L projection | ✅ `profit-loss.projection.ts` |
| Domain tests | ✅ Multiple test files |
| **Gaps** | No multi-currency journals (single currency per journal); no intercompany eliminations; no fixed-asset depreciation GL integration |

### Subcontracts (`@aura/subcontracts`)

| Aspect | Status |
|---|---|
| Subcontract CRUD + lifecycle | ✅ |
| IPC claims + certification | ✅ |
| Retention tracking + release | ✅ Automated AP invoice on release |
| Variations (additions/omissions) | ✅ |
| Back-charges | ✅ With auto AP debit note |
| Domain tests | ✅ subcontracts.test.ts, back-charge.test.ts, variation.test.ts |
| **Gaps** | No labour/material subcontract split |

### Engineering (`@aura/engineering`)

| Aspect | Status |
|---|---|
| Drawings (revision-controlled) | ✅ |
| RFIs (request for information) | ✅ |
| Technical submittals | ✅ |
| Domain tests | ✅ |
| **Gaps** | No BIM model integration; no drawing markup/annotation |

### Document Control (`@aura/doccontrol`)

| Aspect | Status |
|---|---|
| Transmittals | ✅ |
| Correspondence | ✅ |
| Submittals (Code A/B/C/D review) | ✅ |
| **Gaps** | No document numbering policy enforcement |

### Site (`@aura/site`)

| Aspect | Status |
|---|---|
| Daily reports | ✅ |
| Delay logs | ✅ |
| Material consumption | ✅ |
| Site instructions (SI) | ✅ With cost/time flags |
| Domain tests | ✅ site.test.ts, site-instruction.test.ts |

### HSE (`@aura/hse`)

| Aspect | Status |
|---|---|
| Incident reports | ✅ |
| Permits to work | ✅ |
| CAPA (corrective actions) | ✅ |
| Toolbox talks | ✅ With attendance log |
| Domain tests | ✅ hse.test.ts, toolbox-talk.test.ts |
| **Gaps** | No near-miss reporting; no safety statistics dashboard data |

### Quality (`@aura/quality`)

| Aspect | Status |
|---|---|
| NCRs (non-conformance reports) | ✅ |
| Inspection requests | ✅ |
| Snag/punch list | ✅ |
| ITPs (inspection & test plans) | ✅ Hold/witness points |
| Material approval requests (MAR) | ✅ |
| Domain tests | ✅ quality.test.ts, itp.test.ts, material-approval.test.ts |

### HR (`@aura/hr`)

| Aspect | Status |
|---|---|
| Employee profiles | ✅ |
| Leave management | ✅ With balance calculation |
| Payroll runs | ✅ |
| Timesheets | ✅ Daily hours + approval |
| Attendance | ✅ Check-in/out + worked hours |
| Expense claims | ✅ Submit, approve, pay lifecycle |
| Staff advances | ✅ With installment repayment |
| EOSB (gratuity) | ✅ UAE labour law calculation |
| WPS (wage protection) | ✅ |
| Document expiry | ✅ Visa/work-permit compliance |
| Domain tests | ✅ 9 test files |
| **Gaps** | No recruitment/onboarding; no training management; no org chart |

### Fleet (`@aura/fleet`)

| Aspect | Status |
|---|---|
| Vehicles / equipment | ✅ |
| Fuel logs | ✅ |
| Maintenance scheduling | ✅ |
| Traffic fines | ✅ UAE-specific (black points, driver liability) |
| Salik (road tolls) | ✅ UAE-specific (allocate to cost owner, dispute) |
| Domain tests | ✅ fleet.test.ts, traffic-fine.test.ts, salik-charge.test.ts |

### Assets (`@aura/assets`)

| Aspect | Status |
|---|---|
| Asset register | ✅ |
| Maintenance scheduling | ✅ |
| Calibration / inspections | ✅ |
| Depreciation schedules | ✅ UI page exists |
| Domain model | ✅ |
| **Gaps** | No barcode/QR asset tagging; no disposal workflow |

### AMC (`@aura/amc`)

| Aspect | Status |
|---|---|
| Service contracts | ✅ |
| Support tickets + SLA | ✅ |
| Work orders | ✅ |
| PPM (planned preventive maintenance) | ✅ Schedules + recurring visits |
| Work order completed → auto AR invoice | ✅ Automated |
| Domain tests | ✅ amc.test.ts |
| **Gaps** | No field-engineer dispatch; no mobile check-in |

---

## 5. Business Logic Verification

### 5.1 Workflows

| Workflow | Status |
|---|---|
| Configurable state-machine workflow engine | ✅ `WorkflowService` with `PostgresWorkflowStore` |
| Approval workflows | ✅ Procurement approval matrix (level-based) |
| Approval orchestrator | ✅ `ApprovalMatrixService` in core builder |

### 5.2 Automation (Event-Driven)

| Automation | Status |
|---|---|
| Opportunity won → auto-create tender | ✅ Idempotent |
| Tender awarded → auto-create contract | ✅ Idempotent |
| Contract signed → auto-create project + seed WBS/CBS | ✅ Idempotent |
| GRN created → auto-transition PO to 'received' | ✅ |
| Stock below reorder → auto-draft PR | ✅ Threshold crossing only |
| Stock movement → perpetual inventory GL | ✅ |
| IPC certified → auto-draft AR invoice | ✅ |
| Back-charge recovered → auto-draft AP debit note | ✅ |
| Retention released → auto-draft AP invoice | ✅ |
| AMC work-order completed → auto-draft AR invoice | ✅ |
| Invoice paid → roll up spend to WBS | ✅ |
| Tender BOQ updated → auto-sync project CBS | ✅ |

### 5.3 Financial Correctness

| Rule | Status |
|---|---|
| Money as integer minor units (fils/cents) | ✅ `Money` value object |
| Currency mismatch prevention | ✅ Throws on add/subtract |
| Double-entry balance enforcement | ✅ DB trigger + service validation |
| Period-close lockout | ✅ Journals blocked for closed months |
| FX revaluation (AP + AR) | ✅ |
| VAT inclusive/exclusive calculation | ✅ |
| Retention percentage tracking | ✅ In IPC + subcontract claims |

### 5.4 Calculation Concerns

| Finding | Severity |
|---|---|
| EVM calculations are derived from WBS — no independent baseline | P2 |
| Revenue recognition uses simple %-complete — no cost-to-cost method | P2 |
| No rounding policy documentation for multi-currency conversions | P3 |

---

## 6. End-to-End Workflows

### 6.1 Deal Chain (Lead → Closeout)

```
Lead → Opportunity → [won] → Tender (auto) → [awarded] → Contract (auto) → [signed] → Project (auto)
  ↓                                                                                         ↓
  BOQ items                                                                    WBS + CBS seeded from BOQ
```

| Step | Automation | Status |
|---|---|---|
| Lead capture | Manual | ✅ |
| Lead → Opportunity | Manual | ✅ |
| Opportunity → Tender | **Automated** on stage='won' | ✅ |
| Tender → Contract | **Automated** on status='awarded' | ✅ |
| Contract → Project | **Automated** on status='active' | ✅ |
| Project → Procurement | Manual PO creation (linked by projectId) | ✅ |
| Procurement → Inventory | GRN manually created; **auto-transitions PO** | ✅ |
| Inventory → Finance | **Automated** perpetual inventory GL | ✅ |
| Finance → Project cost | **Automated** on invoice.paid → WBS spend | ✅ |
| Project closeout | Manual checklist + finalize | ✅ |
| Warranty / DLP | Tracked in closeout (DLP months) | ✅ |

### 6.2 Broken / Manual Steps

| Step | Issue | Severity |
|---|---|---|
| Lead → Opportunity conversion | No explicit conversion action; user must create opportunity separately | P2 |
| PO → Invoice matching | AP invoice created manually; no 3-way match (PO/GRN/Invoice) | P1 |
| Project completion → contract completion | No reverse update from project to contract status | P2 |
| Quotation → Tender | No automation; quotations and tenders are separate entities | P3 |
| Customer invoice → Payment receipt → Revenue | Receipt recorded; no automatic revenue recognition trigger | P3 |

---

## 7. UI / UX

### 7.1 Page Coverage

**85 pages** across all modules. Every module has at least one dedicated page.

| Module | Pages | Print | Dashboard |
|---|---|---|---|
| CRM | 3 (accounts, leads, quotations) | ✅ quotation print | — |
| Tendering | 2 (list + detail) | — | — |
| Contracts | 2 (list + certificates) | ✅ contract + certificate print | — |
| Projects | 4 (list, dashboard, variations, schedule) | — | ✅ |
| Procurement | 5 (PO, PR, RFQ, suppliers, dashboard) | ✅ PO print | ✅ |
| Inventory | 5 (GRN, stock, transfers, valuation, dashboard) | ✅ GRN print | ✅ |
| Finance | 16 (invoices, AR, aging, ledger, statements, tax, PDC, etc.) | ✅ statement + invoice print | ✅ |
| Subcontracts | 3 (list, variations, back-charges) | ✅ subcontract print | — |
| Engineering | 1 | — | — |
| Document Control | 2 (control + submittals) | — | — |
| Site | 2 (control + instructions) | — | — |
| HSE | 2 (control + toolbox talks) | — | — |
| Quality | 3 (control, ITPs, material approvals) | — | — |
| HR | 8 (control, dashboard, EOSB, timesheets, attendance, expenses, advances, doc expiry) | ✅ payroll print | ✅ |
| Fleet | 3 (control, fines, salik) | — | — |
| Assets | 2 (control + depreciation) | — | — |
| AMC | 2 (main + PPM) | — | — |
| Intelligence | 2 (insights + console) | — | — |
| Platform | 6 (documents, events, audit, templates, views, notifications) | — | — |
| Auth | 1 (login) | — | — |

### 7.2 UI Components

81 component files in `apps/web/components/`. Notable:
- `app-shell.tsx` — sidebar + topbar navigation
- `command-palette.tsx` — keyboard-driven search (⌘+K)
- `ai-dock.tsx` — AI assistant panel
- `role-dashboard-shell.tsx` — role-based dashboard (CEO, PM, CFO, etc.)
- `ceo-command-center.tsx` — executive dashboard
- `cfo-portal.tsx` — CFO dashboard
- `pm-dashboard.tsx` — project manager dashboard
- `project-detail.tsx` — 78KB comprehensive project view
- `tender-detail.tsx` — 37KB tender detail with BOQ

### 7.3 Design System

| Aspect | Status |
|---|---|
| Dark mode | ✅ Default (CSS variables) |
| Light mode | ✅ Theme toggle with `data-theme='light'` |
| Color palette | ✅ Consistent via CSS custom properties |
| Component library | ❌ No shared component library — inline styles + per-component styling |
| Responsive design | ⚠️ Grid layouts exist but no mobile breakpoints |
| Accessibility | ❌ No ARIA attributes, no keyboard navigation beyond command palette |
| Design tokens | ⚠️ CSS variables cover colors only — no spacing/typography tokens |

### 7.4 UI Concerns

| Finding | Severity |
|---|---|
| All styling is inline React `CSSProperties` — no CSS modules, no design system | P2 |
| No mobile-responsive layout — sidebar + content assumes desktop | P1 |
| No loading states or skeleton screens | P2 |
| No error boundaries | P2 |
| No form validation feedback (client-side) | P2 |
| No accessibility compliance (WCAG) | P2 |

---

## 8. API Coverage Analysis

### 8.1 Missing CRUD Operations

| Entity | Missing | Severity |
|---|---|---|
| CRM Accounts | No UPDATE, no DELETE | P2 |
| CRM Leads | No DELETE | P3 |
| Projects | No UPDATE, no DELETE | P2 |
| Purchase Orders | No DELETE | P3 |
| Invoices (AP) | No DELETE | P3 |
| Customer Invoices | No UPDATE | P2 |
| All entities | No bulk operations (bulk create, bulk status change) | P2 |

### 8.2 Missing Endpoints

| Endpoint | Purpose | Severity |
|---|---|---|
| `DELETE /api/v1/{module}/{entity}/:id` | Soft-delete across most modules | P2 |
| `PATCH /api/v1/{module}/{entity}/:id` | Update across many modules | P2 |
| `GET /api/v1/projects/projects/paged` | Paginated project listing | P2 |
| `GET /api/v1/tendering/tenders/paged` | Paginated tender listing | P3 |
| Export endpoints (CSV/Excel) | Data export for reporting | P2 |
| Dashboard aggregate endpoints | KPI calculations for dashboard cards | P3 |

### 8.3 Pagination Gaps

| Module | Paginated? |
|---|---|
| CRM Accounts | ✅ |
| Procurement (PO, PR, RFQ, Suppliers) | ✅ |
| Finance (invoices, customer invoices) | ✅ |
| Projects | ❌ |
| Contracts | ❌ |
| Tendering | ❌ |
| Subcontracts | ❌ |
| HR / Fleet / Assets | ❌ |

---

## 9. Security

### 9.1 Authentication

| Aspect | Status |
|---|---|
| JWT verification (HS256 self-issued) | ✅ |
| JWKS verification (hosted IdP — Supabase) | ✅ With rotation retry |
| Token refresh | ❌ No refresh token flow |
| Password hashing | ❌ Dev login accepts any password (AUTH_DEV_PASSWORD env) |
| MFA | ❌ Not implemented |
| Session management | ❌ Stateless JWT only — no session revocation |

### 9.2 Authorization

| Aspect | Status |
|---|---|
| RBAC model | ✅ Role → Permission → Scope hierarchy |
| ABAC attributes | ✅ Approval limits |
| `PermissionsGuard` | ✅ Exists in core but not consistently applied |
| `AccessService.assert()` | ✅ Throwing variant for service calls |
| Controller-level authorization | ⚠️ Most controllers do NOT call `access.assert()` |
| Role seeding | ⚠️ Only one role seeded (`dealChainAdmin` for `u-admin`) |

### 9.3 Tenant Isolation

| Aspect | Status |
|---|---|
| RLS on 37+ tables | ✅ |
| Hierarchical RLS (branch/project) | ✅ |
| Application-level tenant binding | ✅ AsyncLocalStorage |
| Fallback to `dev-tenant` when no auth | ⚠️ Dangerous in production |

### 9.4 Security Concerns

| Finding | Severity |
|---|---|
| Most controllers do not enforce authorization — any authenticated user can access any data | P0 |
| Dev-tenant fallback when auth is OFF means unauthenticated access in dev mode | P1 |
| `.env.local` committed to repo (but contains no real secrets in example) | P2 |
| No rate limiting on auth/login endpoint | P1 |
| No CSRF protection | P2 |
| No input sanitization (XSS) | P2 |
| CORS enabled with no origin restrictions (`app.enableCors()`) | P1 |
| No audit trail for authentication events (login, logout, failed attempts) | P2 |

---

## 10. Testing

### 10.1 Test Inventory

| Layer | Test Files | Framework |
|---|---|---|
| Shared | 13 (CDM, access, JWT, JWKS, webhook, CSV, pagination, workflow, AI provider, embeddings, DMS) | vitest |
| Core | 14 (command bus, idempotency interceptor, tx, permissions guard, UUID pipe, audit, calendar, exchange rate, numbering, notification, projection engine, OLAP export, saga orchestrator, builder/integration/platform services) | vitest |
| API | 3 (cross-module-subscriber E2E, search service, templates service) | vitest |
| Intelligence | 4 (intelligence, intelligence-platform, project-ledger, vector-store) | vitest |
| Modules — CRM | 3 (account, quotation, account-command) | vitest |
| Modules — Tendering | 2 (tender, BOQ) | vitest |
| Modules — Contracts | 3 (contract, payment-certificate, contract-command) | vitest |
| Modules — Projects | 10 (project, WBS, CBS, delay-EOT, variation, closeout, cashflow, schedule, CBS-sync, project-command) | vitest |
| Modules — Procurement | 5 (procurement, PO, RFQ, supplier, approval-matrix) | vitest |
| Modules — Inventory | 4 (GRN, stock, stock-transfer, FIFO) | vitest |
| Modules — Finance | 18 (invoice, customer-invoice, finance, statements, AP/AR aging, petty-cash, bank-guarantee, PDC, budget, consolidation, cost-center, profit-center, revenue-recognition, VAT-return, FX-reval, AP-FX-reval, payment-idempotency, period-close, journal-store, P&L projection) | vitest |
| Modules — Subcontracts | 3 (subcontracts, variation, back-charge) | vitest |
| Modules — Engineering | 1 | vitest |
| Modules — DocControl | 2 (doccontrol, submittal) | vitest |
| Modules — Site | 2 (site, site-instruction) | vitest |
| Modules — HSE | 2 (HSE, toolbox-talk) | vitest |
| Modules — Quality | 3 (quality, ITP, material-approval) | vitest |
| Modules — HR | 9 (HR, attendance, document-expiry, EOSB, expense-claim, leave-balance, staff-advance, timesheet, WPS) | vitest |
| Modules — Fleet | 3 (fleet, traffic-fine, salik-charge) | vitest |
| Modules — Assets | 2 (assets, depreciation) | vitest |
| Modules — AMC | 3 (AMC, PPM-schedule, postgres-store) | vitest |

**Verified total: ~105 test files**

### 10.2 Test Coverage by Module

| Module | Test Files | Domain Tests | Service/Command Tests | Store Tests |
|---|---|---|---|---|
| CRM | 3 | ✅ account, quotation | ✅ account-command | — |
| Tendering | 2 | ✅ tender, BOQ | — | — |
| Contracts | 3 | ✅ contract, payment-certificate | ✅ contract-command | — |
| Projects | 10 | ✅ WBS, CBS, delay-EOT, variation, closeout, cashflow, schedule | ✅ CBS sync, project-command | — |
| Procurement | 5 | ✅ PO, procurement, RFQ, supplier, approval-matrix | — | — |
| Inventory | 4 | ✅ GRN, stock, transfer, FIFO | — | — |
| Finance | 18 | ✅ invoice, customer-invoice, statements, aging, petty-cash, BG, PDC, budget, consolidation, cost/profit center, revenue-recognition, VAT | ✅ payment-idempotency, period-close, AP-FX-reval | ✅ journal-store |
| Subcontracts | 3 | ✅ subcontract, variation, back-charge | — | — |
| Engineering | 1 | ✅ | — | — |
| DocControl | 2 | ✅ doccontrol, submittal | — | — |
| Site | 2 | ✅ site, site-instruction | — | — |
| HSE | 2 | ✅ HSE, toolbox-talk | — | — |
| Quality | 3 | ✅ quality, ITP, MAR | — | — |
| HR | 9 | ✅ HR, attendance, document-expiry, EOSB, expense-claim, leave-balance, staff-advance, timesheet, WPS | — | — |
| Fleet | 3 | ✅ fleet, traffic-fine, salik-charge | — | — |
| Assets | 2 | ✅ assets, depreciation | — | — |
| AMC | 3 | ✅ AMC, PPM-schedule | — | ✅ postgres-store |

### 10.3 Testing Strengths

- Domain-level test coverage is comprehensive: every module has at least 1 test file
- Finance has the deepest coverage with 18 test files spanning domain, service, and store layers
- Core platform services are well-tested (14 files: command bus, saga, projections, etc.)
- Shared identity layer is tested (access evaluation, JWT signing/verification, JWKS)
- Cross-module E2E test proves the full deal chain + idempotency in-memory

### 10.4 Testing Concerns

| Finding | Severity |
|---|---|
| Only 1 Postgres store test in modules (AMC) — almost all tests use in-memory stores | P1 |
| Zero E2E API tests (no supertest / HTTP-level testing) | P1 |
| Zero UI tests (no Playwright, Cypress, or React Testing Library) | P1 |
| No test coverage measurement configured | P2 |
| Cross-module subscriber E2E test is the only workflow-level test | P2 |

---

## 11. Production Readiness

| Aspect | Status | Detail |
|---|---|---|
| **CI/CD** | ❌ None | No `.github/workflows`, no GitLab CI, no CI config found |
| **Docker** | ❌ None | No Dockerfile, no docker-compose |
| **Monitoring** | ❌ None | No Prometheus, no health metrics beyond `/health` |
| **Structured logging** | ⚠️ Partial | NestJS `Logger` used but no JSON structured format |
| **APM / Tracing** | ⚠️ Partial | `x-correlation-id` propagated; no OpenTelemetry |
| **Backups** | ❌ None | No backup strategy or scripts |
| **Disaster recovery** | ❌ None | No documented DR plan |
| **Load testing** | ❌ None | No k6, Artillery, or JMeter configs |
| **Environment configs** | ⚠️ Partial | `.env.example` exists; no staging/production configs |
| **Secrets management** | ❌ None | Env vars only; no Vault/KMS |
| **Health checks** | ✅ | `/health` endpoint exists |
| **Graceful shutdown** | ✅ | `app.enableShutdownHooks()` |
| **Feature flags** | ✅ | `FeatureFlagService` in core |

---

## 12. Customer Perspective (Role-Based Assessment)

### Can each role perform daily work?

| Role | Verdict | Rationale |
|---|---|---|
| **CEO** | ⚠️ Partially | Dashboard exists (`ceo-command-center.tsx`); pipeline funnel + project ledger visible. No P&L summary on dashboard; no cashflow visibility at exec level. |
| **Project Manager** | ✅ Mostly | PM dashboard exists. WBS, CBS, EVM, variations, delays, EOT, closeout, schedule all functional. Missing resource allocation. |
| **Accountant** | ✅ Mostly | Full GL, COA, P&L, balance sheet, trial balance, period close, VAT returns, bank reconciliation, AR/AP aging. Missing intercompany eliminations and automated depreciation posting. |
| **Procurement Officer** | ✅ Mostly | PR → RFQ → PO → GRN flow complete. Supplier management present. Missing 3-way match and PO line items. |
| **Site Engineer** | ✅ Mostly | Daily reports, delay logs, material consumption, site instructions all present. Missing photo/document attachment to daily reports from UI. |
| **HR Officer** | ✅ Mostly | Employee management, leave, payroll, timesheets, attendance, expense claims, EOSB, WPS, document expiry all present. Missing recruitment and org chart. |
| **Maintenance Manager** | ✅ Mostly | AMC contracts, work orders, PPM schedules, asset register all present. Missing mobile field dispatch. |

---

## 13. Gap Analysis

### P0 — Critical (Blockers for production)

| # | Finding | Module |
|---|---|---|
| 1 | Most controllers do not enforce authorization — any authenticated user can perform any action | Security |
| 2 | Open CORS with no origin restriction | Security |

### P1 — High (Required before launch)

| # | Finding | Module |
|---|---|---|
| 3 | No CI/CD pipeline | Production |
| 4 | No Docker configuration | Production |
| 5 | No E2E or integration tests against a real database | Testing |
| 6 | No composite database indexes for common query patterns | Database |
| 7 | Dev-tenant fallback allows unauthenticated data access | Security |
| 8 | No rate limiting on authentication endpoints | Security |
| 9 | No 3-way matching (PO/GRN/Invoice) | Procurement |
| 10 | No mobile-responsive UI | UI/UX |
| 11 | No UI tests | Testing |
| 12 | No token refresh flow | Auth |

### P2 — Medium (Required for commercial quality)

| # | Finding | Module |
|---|---|---|
| 13 | No runtime request validation (class-validator / Zod) | Backend |
| 14 | No global exception filter for unhandled errors | Backend |
| 15 | UPDATE and DELETE operations missing on many entities | API |
| 16 | Pagination missing on Projects, Contracts, Tendering, HR | API |
| 17 | Inline styling — no design system or component library | UI/UX |
| 18 | No loading states, error boundaries, or skeleton screens | UI/UX |
| 19 | No client-side form validation | UI/UX |
| 20 | No accessibility (WCAG) | UI/UX |
| 21 | No CSRF protection | Security |
| 22 | No audit trail for authentication events | Security |
| 23 | CrossModuleSubscriber is a monolith (479 lines) | Architecture |
| 24 | No migration rollback support | Database |
| 25 | Many FK references are denormalized text, not actual foreign keys | Database |
| 26 | EVM calculations have no independent baseline | Projects |
| 27 | No bulk operations API | API |
| 28 | No export endpoints (CSV/Excel) from API | API |
| 29 | No contact/person entities in CRM | CRM |
| 30 | Lead → Opportunity has no conversion automation | CRM |
| 31 | No PO line items | Procurement |
| 32 | No test coverage measurement | Testing |
| 33 | Event bus is in-process only — no distributed messaging | Architecture |

### P3 — Low (Nice to have)

| # | Finding | Module |
|---|---|---|
| 34 | No cursor-based pagination option | API |
| 35 | No multi-revision BOQ in tendering | Tendering |
| 36 | No batch/serial tracking in inventory | Inventory |
| 37 | No recruitment / onboarding in HR | HR |
| 38 | No barcode/QR asset tagging | Assets |
| 39 | No BIM integration in engineering | Engineering |
| 40 | No field-engineer mobile dispatch in AMC | AMC |
| 41 | No email integration in CRM | CRM |
| 42 | Quotation → Tender not automated | CRM |
| 43 | No structured JSON logging | Production |
| 44 | No OpenTelemetry tracing | Production |
| 45 | No seed data for COA or demo setup | Database |

---

## 14. Overall Assessment

| Area | Score | Comment |
|---|---|---|
| **Architecture** | 8.0/10 | Clean modular monolith; excellent event-driven design; dual-store pattern is elegant |
| **Backend** | 7.5/10 | All modules wired with services + stores; lacking runtime validation and some CRUD ops |
| **Database** | 7.0/10 | 96 migrations covering broad schema; RLS + multi-tenancy solid; indexes and FK integrity need work |
| **Business Logic** | 8.5/10 | Impressive automation chain; 12 automated cross-module reactions; strong financial primitives |
| **UI/UX** | 6.0/10 | 85 pages with good coverage; dark/light themes; but inline styling, no mobile, no accessibility |
| **API** | 7.0/10 | 41 controllers; good CRUD coverage; missing updates/deletes and pagination on many entities |
| **Workflows** | 8.5/10 | Full deal chain automated end-to-end with idempotency; saga orchestrator; approval matrix |
| **Security** | 4.0/10 | Auth infra exists (JWT + JWKS + RLS); but authorization not enforced in controllers; open CORS |
| **Testing** | 6.5/10 | ~105 test files with strong domain coverage; minimal Postgres integration tests; zero E2E/UI tests |
| **Production Readiness** | 3.0/10 | No CI/CD, no Docker, no monitoring, no backups, no DR |
| **Commercial Readiness** | 5.5/10 | Functionally broad; security and production gaps prevent deployment |

### Composite Score: **6.5 / 10**

> The platform demonstrates strong architectural vision and impressive business domain coverage for a construction/contracting ERP. The event-driven deal chain automation is a standout feature. However, security enforcement gaps, zero production infrastructure, and lack of integration testing make it unsuitable for production deployment in its current state.

---

## 15. Final Recommendations

### Phase 1 — Security Hardening (Weeks 1–2)

1. Apply `@RequirePermission()` guard to all controller methods
2. Restrict CORS to allowed origins
3. Add rate limiting to auth endpoints
4. Remove dev-tenant fallback in production mode
5. Add runtime request validation (Zod or class-validator)
6. Add global exception filter

### Phase 2 — Production Infrastructure (Weeks 2–4)

7. Create Dockerfiles for API and Web
8. Create docker-compose for local dev (API + Postgres + Web)
9. Set up CI/CD pipeline (build, typecheck, test, deploy)
10. Add composite database indexes for tenant+status patterns
11. Configure structured JSON logging
12. Add health check with DB connectivity probe

### Phase 3 — Testing Foundation (Weeks 3–5)

13. Add integration tests against Postgres for core stores
14. Add E2E API tests for deal chain flow
15. Add UI tests for critical flows (login, create PO, post journal)
16. Set up coverage reporting

### Phase 4 — API Completeness (Weeks 4–6)

17. Add UPDATE endpoints for all entities
18. Add soft-delete endpoints
19. Add pagination to all list endpoints
20. Add bulk operation endpoints
21. Add CSV/Excel export endpoints

### Phase 5 — UI Polish (Weeks 5–8)

22. Extract shared component library (tables, forms, modals, buttons)
23. Add mobile-responsive layout
24. Add loading states and error boundaries
25. Add client-side form validation
26. Begin WCAG accessibility audit

### Phase 6 — Business Depth (Ongoing)

27. Implement 3-way matching (PO/GRN/Invoice)
28. Add PO line items
29. Add CRM contacts and activity logging
30. Add Lead → Opportunity conversion
31. Add intercompany eliminations for group consolidation

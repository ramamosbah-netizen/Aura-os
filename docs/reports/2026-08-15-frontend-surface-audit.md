# AURA OS — Frontend Surface Audit (Phase 1)

**Date:** 2026-08-15
**Scope:** Map every backend capability to its frontend surface. Discover gaps only — **no code changes in this phase.**
**Method:** Enumerated all 102 API controllers (`apps/api/src/**/*.controller.ts`) and their route decorators; enumerated all 173 Next pages (`apps/web/app/**/page.tsx`); read the single nav source (`apps/web/components/nav.ts`); verified tab-hub depth and "no-UI" gaps by grepping `apps/web/{app,components}` for each backend path. Counts and gaps are measured, not estimated.

## Legend — UI status

| Status | Meaning |
|---|---|
| 🟢 Complete | Capability fully surfaced: discoverable page + list/detail + the workflow actions the backend exposes |
| 🟠 Partial | Page exists but a slice is unreachable — no detail/360, missing workflow actions, or feature is embedded-only with no dedicated surface |
| 🔴 Missing | No usable frontend — backend capability exists, no page and no embedded UI |

**Workflow column:** `Complete` = all backend state transitions have UI controls · `Partial` = some transitions/child-actions missing · `Available` = backend workflow exists, no UI drives it · `—` = CRUD/read-only, no state machine.

---

## Executive summary

- **Frontend maturity is high.** The large hubs (Engineering, Quality, HSE, Site, Finance, CRM, Procurement, Inventory) are genuinely built out, most with governed workflow controls wired through a Next BFF proxy layer.
- **The gaps are concentrated, not spread thin.** A small set of backend capabilities have **zero** frontend, and a second set are **embedded-only** (reachable inside a parent 360, but no dedicated register/discoverable page).
- **First-class areas the prompt names that have no dedicated home:** Communications, Calendar, Meetings, Risks, Issues, Actions — these exist only as fragments inside `/workspace`, `/crm/my-day`, or parent 360s.

### 🔴 True "no frontend" gaps (measured: 0 references in `apps/web`)

| # | Module | Backend capability | Controller | Impact |
|---|---|---|---|---|
| 1 | ELV | Device register · punch-list · commissioning status | `elv/elv-devices.controller.ts` | Entire ELV module has **no page** — core vertical for this business |
| 2 | Procurement | Framework agreements + call-offs | `procurement/framework-agreements.controller.ts` | Blanket-order buying invisible |
| 3 | HR | Org chart | `hr` `GET /org-chart` | Reporting hierarchy not viewable |
| 4 | Tendering | Win/Loss outcomes + analytics | `tendering/win-loss.controller.ts` | Bid post-mortem data captured, never shown |
| 5 | Finance | Profit centers (+ report) | `finance` `profit-centers*` | Cost centers surfaced; profit centers not |
| 6 | Projects | Cashflow forecasts | `projects` `cashflow-forecasts*` | Project cash projection has no view |
| 7 | Projects | Cost ledger · Quantity ledger | `projects` `cost-ledger`, `quantity-ledger` | Financial ledgers behind CBS not browsable |
| 8 | HR | WPS SIF file generation | `hr` `POST /wps` | UAE payroll file trigger has no button |

### 🟠 Embedded-only (works inside a parent, but no dedicated discoverable surface)

| Module | Capability | Where it lives today | Missing |
|---|---|---|---|
| Contracts | Obligations register | inside Contract 360 | No cross-contract obligations page / due-soon queue |
| Quality | Quality audits | inside `/quality/control` | No dedicated audits page in nav |
| Doc Control | Correspondence log | inside doc-control client | No dedicated correspondence surface in nav |
| Finance | Petty-cash transaction drill | petty-cash list | Per-float transaction ledger view |
| Subcontracts | Subcontract 360 | print view only | No on-screen subcontract detail page (only `/print`) |

---

## Full capability matrix by functional area

> One row per meaningful backend capability. Routes are the live Next paths. "Workflow" reflects backend state transitions vs UI controls.

### My Day / Home / Personal

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| My Work command center | ✅ | `/` | — | 🟢 |
| My Day (tasks, approvals, AI) | ✅ | `/crm/my-day` | — | 🟢 |
| Workspace (chat + mail + inbox + views) | ✅ | `/workspace` | — | 🟢 |
| Inbox (approvals + mail) | ✅ | `/inbox` | — | 🟢 |
| Global search | ✅ | `/search` | — | 🟢 |
| Saved views | ✅ | `/views` | — | 🟢 |

### Communications (`comms`)

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Channels + messages | partial | inside `/workspace` | — | 🟠 no dedicated Comms area |
| Direct messages | partial | inside `/workspace` | — | 🟠 |
| Internal mail (send/read/unread) | partial | inside `/workspace` | — | 🟠 |

### Notifications & Calendar

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Notifications feed + unread + mark-read | ✅ | `/notifications` | — | 🟢 |
| Working calendar / holidays / adjustments (config) | ✅ | `/admin/calendar` | — | 🟢 (admin-only) |
| User calendar / meetings view | ❌ | — | — | 🔴 no personal calendar or meetings surface |

### CRM / Sales

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Accounts + 360 + installed-base + relationships | ✅ | `/crm/accounts`, `/crm/accounts/:id` | Partial | 🟢 |
| Contacts + 360 | ✅ | `/crm/contacts`, `/crm/contacts/:id` | — | 🟢 |
| Leads: assign→accept→qualify→convert | ✅ | `/crm/leads`, `/crm/leads/:id` | Complete | 🟢 |
| Opportunities + 360 + depth (stakeholders/deal-team/commitments/risks/register) | ✅ | `/crm/opportunities/:id` | Complete | 🟢 |
| Pre-award (requirements, scopes, generate-quotation) | ✅ | inside opportunity | Partial | 🟠 |
| Quotations + revisions + convert-to-contract | ✅ | `/crm/quotations`, `/crm/quotations/:id` | Complete | 🟢 |
| Pricing sheets (freeze/revise/generate) | ✅ | `/crm/quotations/:id/pricing` | Complete | 🟢 |
| Campaigns | ✅ | `/crm/campaigns` | Partial | 🟢 |
| Signals / Radar (advance/promote/dismiss) | ✅ | in `/crm/leads` + radar panels | Complete | 🟢 |
| Activities (start/complete/cancel/reopen) | ✅ | `/crm/activities` | Complete | 🟢 |
| Negotiation | partial | inside `/crm/commercial` | — | 🟠 |
| Source funnel / forecast / executive cockpit | ✅ | `/crm/overview` | — | 🟢 |
| Deal brief / email-draft / meeting-summary (AI) | partial | inside opportunity 360 | — | 🟠 |
| Market intelligence catalogue + product knowledge | ✅ | `/crm/market-intelligence` | — | 🟢 |

### Tendering

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Tenders + status + submit + clarifications | ✅ | `/tendering/tenders`, `/tendering/tenders/:id` | Complete | 🟢 |
| BOQ (items, import, upload) | ✅ | inside tender detail | Complete | 🟢 |
| Pricing sheets + rate build-up + generate-quotation | ✅ | `/tendering/tenders/:id/pricing`, `/tendering/pricing` | Complete | 🟢 |
| Bid scores | partial | referenced only | — | 🟠 no dedicated scoring page |
| Estimates | partial | inside pricing | — | 🟠 |
| **Win/Loss outcomes + analytics** | ❌ | — | Available | 🔴 |

### Contracts

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Contracts + status + 360 | ✅ | `/contracts/contracts`, `/contracts/contracts/:id` | Complete | 🟢 |
| Payment certificates (IPC) + lines + status | ✅ | `/contracts/certificates` | Complete | 🟢 |
| Clause library (versioned) | ✅ | `/contracts/clauses` | — | 🟢 |
| Bonds + expiring + status | partial | inside Contract 360 | Partial | 🟠 no bonds register page |
| **Obligations + due-soon + status** | partial | inside Contract 360 | Partial | 🟠 no obligations register/queue |

### Projects / Delivery

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Projects + 360 + status + portfolio | ✅ | `/projects/projects`, `/projects/projects/:id` | Complete | 🟢 |
| Project delivery workspace (per-area) | ✅ | `/project/:projectId`, `/project/:projectId/:area` | — | 🟢 |
| Project members / team | ✅ | `/project/:projectId/team` | — | 🟢 |
| WBS + progress | ✅ | inside project | Partial | 🟢 |
| CBS + summary | ✅ | inside project | — | 🟢 |
| EVM | ✅ | inside project | — | 🟢 |
| Variations + status | ✅ | `/projects/variations` | Complete | 🟢 |
| Delays + analysis | ✅ | referenced | Partial | 🟠 |
| EOT claims (submit/decide) | partial | referenced | Partial | 🟠 no EOT register page |
| Schedules / Gantt (plan/baseline) | ✅ | `/projects/schedule` | Partial | 🟠 no plan/baseline controls |
| Closeouts (finalize) | ✅ | `/projects/closeout` | Complete | 🟢 |
| **Cashflow forecasts** | ❌ | — | — | 🔴 |
| **Cost ledger / Quantity ledger** | ❌ | — | — | 🔴 |

### Engineering

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Drawings: submit→review→revise→transmit→close | ✅ | `/engineering`, `/engineering/drawings/:id` | Complete | 🟢 |
| RFIs (answer) | ✅ | in `/engineering` hub | Partial | 🟠 no RFI detail page |
| Submittals (status) | ✅ | in `/engineering` hub | Partial | 🟠 no detail page |
| Design changes (decision) | ✅ | in `/engineering` hub | Partial | 🟠 list light, no detail |
| Technical queries (respond) | ✅ | in `/engineering` hub | Partial | 🟠 |
| Documents + types (transition) | ✅ | in `/engineering` hub | Partial | 🟠 |
| BIM models (versions) | ✅ | in `/engineering` hub | Partial | 🟠 |

### Site

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Daily reports: submit→review→approve/reject + child lines (labour/plant/progress/delay/evidence) | ✅ | `/site/daily-reports`, `/site/execution/:id` | Complete | 🟢 |
| Delay logs (resolve) | ✅ | in `/site/control` | Partial | 🟢 |
| Material consumption | ✅ | in `/site/control` | — | 🟢 |
| Site instructions (acknowledge/close) | ✅ | `/site/instructions` | Complete | 🟢 |
| Labour / plant / installations | partial | in `/site/control` | — | 🟠 |

### Quality

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| NCR: plan→correct→verify + verifications | ✅ | `/quality/ncrs`, `/quality/ncrs/:id` | Complete | 🟢 |
| Inspection requests: start→raise-ncr→resolve | ✅ | `/quality/inspection-requests` | Complete | 🟢 |
| Snags (resolve/close) | ✅ | `/quality/snags` | Complete | 🟢 |
| ITPs (activate/points/close) | ✅ | `/quality/itps` | Complete | 🟢 |
| Material approvals (submit/review/revise) | ✅ | `/quality/material-approvals` | Complete | 🟢 |
| Calibrations | ✅ | `/quality/calibrations` | — | 🟢 |
| **Quality audits + checklist + raise-NCR** | partial | inside `/quality/control` | Partial | 🟠 no dedicated audits page |

### HSE

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Incidents: investigate→close→reopen + detail | ✅ | in `/hse/control` | Complete | 🟠 no incident detail page |
| Permits to work: request→approve/reject→close/expire/reopen | ✅ | `/hse/permits`, `/hse/permits/:id` | Complete | 🟢 |
| CAPA (complete) | ✅ | in `/hse/control` | Partial | 🟢 |
| Risk assessments (approve) | ✅ | `/hse/risk-assessments` | Complete | 🟢 |
| Toolbox talks | ✅ | `/hse/toolbox-talks` | — | 🟢 |
| Training + per-worker | ✅ | in `/hse/control` | — | 🟢 |

### Procurement

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Purchase orders: submit→approve + status | ✅ | `/procurement/purchase-orders`, `/:id` | Complete | 🟢 |
| Purchase requests + status | ✅ | `/procurement/purchase-requests` | Complete | 🟢 |
| RFQs: send→quotes→award | ✅ | `/procurement/rfqs` | Complete | 🟢 |
| Suppliers + status | ✅ | `/procurement/suppliers` | Complete | 🟢 |
| 3-way match | ✅ | `/procurement/three-way-match` | — | 🟢 |
| Spend analytics | ✅ | `/procurement/spend-analytics` | — | 🟢 |
| **Framework agreements + call-offs** | ❌ | — | Available | 🔴 |

### Inventory / Materials

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Stock + movements + valuation + reorder + FIFO | ✅ | `/inventory/stock`, `/inventory/valuation` | — | 🟢 |
| GRNs | ✅ | `/inventory/grns` | — | 🟢 |
| Transfers | ✅ | `/inventory/transfers` | — | 🟢 |
| Serial tracking: issue→install→return→fault | ✅ | `/inventory/serials` | Complete | 🟢 |
| Locations / bins | ✅ | `/inventory/locations` | — | 🟢 |

### Subcontractors / Suppliers

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Subcontracts + status | ✅ (list) | `/subcontracts/subcontracts` | Partial | 🟠 detail = print only, no 360 |
| Progress claims (certify/pay) | ✅ | `/subcontracts/claims` | Complete | 🟢 |
| Variations (approve/reject) | ✅ | `/subcontracts/variations` | Complete | 🟢 |
| Back-charges (status/recover) | ✅ | `/subcontracts/back-charges` | Complete | 🟢 |
| Suppliers (see Procurement) | ✅ | `/procurement/suppliers` | Complete | 🟢 |

### Documents / Doc Control

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Documents + versions + share + permissions | ✅ | `/documents` | Partial | 🟢 |
| Controlled register + revisions (submit→review→approve→issue→supersede) | ✅ | `/documents/control`, `/doccontrol/register/:id` | Complete | 🟢 |
| Transmittals (send/receive/acknowledge) | ✅ | `/doccontrol/transmittals` | Complete | 🟢 |
| Submittals (submit/return) | ✅ | `/doccontrol/submittals` | Complete | 🟢 |
| Correspondence (close) | partial | in doc-control client | Partial | 🟠 no dedicated page in nav |
| Document requirements (evidence/waive/NA) | partial | referenced | Partial | 🟠 |

### Commissioning / Handover / Compliance / ELV

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Commissioning: test→commission→fail + test-items + punch | ✅ | `/commissioning`, `/commissioning/:id` | Complete | 🟢 |
| Handover: checklist→submit→accept/reject | ✅ | `/handover` | Complete | 🟢 |
| Compliance cases: submissions/inspections/decisions/certificates/renewals | ✅ | `/compliance` | Partial | 🟠 single page, deep workflow may be thin |
| **ELV devices: register + punch-list + status + commissioning** | ❌ | — | Available | 🔴 entire module unsurfaced |

### Finance

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Supplier invoices + status + aging + FX-reval | ✅ | `/finance/invoices`, `/finance/ap-aging` | Complete | 🟢 |
| Customer invoices: issue→receipts→cancel + aging | ✅ | `/finance/customer-invoices`, `/finance/ar-aging` | Complete | 🟢 |
| GL: accounts + journals + COA | ✅ | `/finance/ledger` | — | 🟢 |
| Cost centers (report) | partial | referenced | — | 🟠 |
| **Profit centers (report)** | ❌ | — | — | 🔴 |
| Payments | ✅ | in ledger / reconciliation | — | 🟢 |
| Bank reconciliation (auto-match/reconcile) | ✅ | `/finance/bank-reconciliation` | Complete | 🟢 |
| Statements (TB/P&L/BS/CF/consolidated) | ✅ | `/finance/statements`, `/finance/consolidation` | — | 🟢 |
| Period close (close/reopen) | ✅ | `/finance/period-close` | Complete | 🟢 |
| Budgets + vs-actual | ✅ | `/finance/budgets` | — | 🟢 |
| Revenue recognition | ✅ | `/finance/revenue-recognition` | — | 🟢 |
| FX rates + convert | ✅ | `/finance/fx` | — | 🟢 |
| Tax codes + VAT returns | ✅ | `/finance/tax`, `/finance/vat-returns` | Complete | 🟢 |
| Petty cash + transactions | ✅ (list) | `/finance/petty-cash` | Partial | 🟠 no transaction drill |
| Bank guarantees + status | ✅ | `/finance/bank-guarantees` | Complete | 🟢 |
| Post-dated cheques + status | ✅ | `/finance/post-dated-cheques` | Complete | 🟢 |

### HR / People

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Employees + document-expiry | ✅ | `/hr/control`, `/hr/document-expiry` | — | 🟢 |
| Leaves (resolve) + balance | ✅ | in `/hr/control` | Complete | 🟢 |
| Payroll (pay) | ✅ | `/hr/control`, `/hr/payroll/:id/print` | Complete | 🟢 |
| **WPS SIF generation** | ❌ | — | Available | 🔴 no trigger button |
| EOSB / gratuity | ✅ | `/hr/eosb` | — | 🟢 |
| Timesheets (submit/approve/reject) | ✅ | `/hr/timesheets` | Complete | 🟢 |
| Attendance (checkout/summary) | ✅ | `/hr/attendance` | Complete | 🟢 |
| Expense claims (submit/approve/reject/reimburse) | ✅ | `/hr/expense-claims` | Complete | 🟢 |
| Staff advances (approve/reject/disburse/repay) | ✅ | `/hr/staff-advances` | Complete | 🟢 |
| Appraisals (submit/acknowledge) | ✅ | `/hr/appraisals` | Complete | 🟢 |
| **Org chart** | ❌ | — | — | 🔴 |

### Fleet & Assets

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Vehicles + fuel + maintenance + telemetry | ✅ | `/fleet/control` | Complete | 🟢 |
| Traffic fines (assign/dispute/resolve/pay) | ✅ | `/fleet/fines` | Complete | 🟢 |
| Salik tolls (allocate/dispute) | ✅ | `/fleet/salik` | Complete | 🟢 |
| Assets register + 360 + maintenance + inspections + QR | ✅ | `/assets/control`, `/assets/register/:id` | Complete | 🟢 |
| Depreciation | ✅ | `/assets/depreciation` | — | 🟢 |
| Disposals | ✅ | `/assets/disposals` | Complete | 🟢 |

### AMC / Service

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Contracts + terminate | ✅ | `/amc` | Complete | 🟢 |
| Tickets: assign→resolve + SLA | ✅ | `/amc` | Complete | 🟢 |
| Work orders: assign→start→complete/cancel + dispatch board | ✅ | `/amc/dispatch`, `/amc/work-orders/:id` | Complete | 🟢 |
| PPM schedules (deactivate/generate-due) | ✅ | `/amc/ppm` | Complete | 🟢 |

### AI / Intelligence

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| AI workspace (ask agents, assistants, proposals) | ✅ | `/ai` | — | 🟢 |
| Intelligence briefing / pipeline / insights | ✅ | `/intelligence` | — | 🟢 |
| Intelligence console (IEC pricing/autonomy, proposals execute/reject) | ✅ | `/admin/intelligence` | Complete | 🟢 |
| Platform AI runtime / agents / autonomy / guardrails / marketplace | ✅ | `/admin/ai` | Complete | 🟢 |

### Administration / Platform

| Backend capability | Page | Route | Workflow | UI status |
|---|---|---|---|---|
| Access / roles / grants | ✅ | `/admin/access` | — | 🟢 |
| Approval matrix | ✅ | `/admin/approval-matrix` | — | 🟢 |
| Users (activate/deactivate) | ✅ | `/admin/users` | — | 🟢 |
| Companies | ✅ | `/admin/organization` | — | 🟢 |
| Service accounts | partial | referenced | — | 🟠 |
| Feature flags | ✅ | `/admin/feature-flags` | — | 🟢 |
| Connectors | ✅ | `/admin/connectors` | — | 🟢 |
| Numbering | ✅ | `/admin/numbering` | — | 🟢 |
| Settings | ✅ | `/admin/settings` | — | 🟢 |
| Webhooks + deliveries | ✅ | `/admin/webhooks` | — | 🟢 |
| Forms admin + builder (publish) | ✅ | `/admin/forms` | Partial | 🟠 designer partial |
| Templates | ✅ | `/admin/templates` | — | 🟢 |
| Data lifecycle / archive | ✅ | `/admin/data` | — | 🟢 |
| Audit trail + export | ✅ | `/admin/audit` | — | 🟢 |
| Events + dead-letters | ✅ | `/events` | — | 🟢 |
| Health / metrics | ✅ | `/admin/health` | — | 🟢 |
| Workflows registry + instances (start/transition) | ✅ | `/admin/workflows` | Partial | 🟠 generic instance driver |

### First-class areas the prompt names — status roll-up

| Area | Home today | Status |
|---|---|---|
| My Day | `/crm/my-day` | 🟢 |
| Communications | fragment in `/workspace` | 🟠 no dedicated area |
| Notifications | `/notifications` | 🟢 |
| Calendar | `/admin/calendar` (config only) | 🔴 no user calendar |
| Projects, Engineering, Site, Quality, HSE, Procurement, Materials, Subcontractors, Suppliers, Documents, Commissioning, Handover, Commercial, Finance, CRM | dedicated | 🟢 |
| Meetings | fragment in my-day / deal-brief | 🔴 no meetings surface |
| Risks | fragment in opportunity/project | 🟠 no cross-cutting risk register |
| Issues | — | 🔴 no issues concept surfaced |
| Actions | fragment (CAPA / commitments / my-day) | 🟠 no unified actions surface |
| Assets | `/assets/*` | 🟢 |
| Reporting | statements / analytics / spend | 🟠 scattered, no reporting hub |
| Administration | `/admin/*` | 🟢 |
| AI | `/ai`, `/intelligence` | 🟢 |

---

## Phase 2 build backlog (proposed order — no code yet)

**P0 — zero-frontend backend capabilities (highest leverage):**
1. **ELV device workspace** — register + punch-list + status/commissioning transitions (`elv/devices`). Core vertical.
2. **Tendering Win/Loss** — outcomes register + analytics page.
3. **Procurement Framework Agreements** — list + call-offs + activate/terminate.
4. **Finance Profit Centers** + report (mirror the cost-centers surface).
5. **Project Cashflow Forecasts** page.

**P1 — embedded → dedicated + missing detail views:**
6. **Contract Obligations register** + due-soon queue (data already in 360).
7. **Contract Bonds register** (data in 360).
8. **Subcontract 360** on-screen detail (currently print-only).
9. **Quality Audits** dedicated page (data in control hub).
10. **EOT Claims register** + submit/decide controls.
11. **Engineering detail views** for RFI / Submittal / Design-change / TQ (hub-only today).
12. **HR Org Chart** page.
13. **Doc Control Correspondence** dedicated surface.

**P2 — first-class areas without a home:**
14. **Communications** dedicated area (promote comms out of `/workspace`).
15. **Calendar / Meetings** user-facing surface.
16. **Actions** unified surface (CAPA + commitments + my-day tasks + instructions).
17. **Risks** cross-cutting register.
18. **Reporting hub** consolidating statements + analytics + exports.

**P3 — depth completion:**
19. Petty-cash transaction drill · Cost/Quantity ledger browsers · WPS generation trigger · Schedule plan/baseline controls · Project delays register.

---

## Guardrails carried into Phase 2 (per the request)

- No new backend capabilities, no business-logic rewrites, no schema/API-contract/financial-calc changes, no removal of working functionality.
- Every new page is a **read/act surface over an existing endpoint** and registers in `apps/web/components/nav.ts` so it is discoverable.
- New pages reuse existing patterns: server page → Next BFF proxy (`/api/*`) → client component with create-drawer + status controls; locale via `apps/web/lib/locale.ts`; error/empty/loading states per the `DataStateNotice` convention.

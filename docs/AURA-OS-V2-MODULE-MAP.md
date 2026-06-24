# AURA OS v2 — Module, Navigation & UI Master Map (Tier-1 scope)

> The **industry-depth** companion to [`AURA-OS-V2-BLUEPRINT.md`](AURA-OS-V2-BLUEPRINT.md). The architecture there is unchanged — this document takes the full Tier-1 scope (20 areas) and structures it into the clean architecture: bounded contexts, data ownership, pages, emitted events, and a build sequence.
>
> **Target:** one platform for **MEP · ELV · General Contractors · Facilities Management · AMC · Security/Low-Voltage integrators · multi-company groups** — no second ERP required.
> **Date:** 2026-06-24 · **Status:** scope draft for sign-off.

---

## 1. The 20 areas → 5 architecture layers

Your 20 areas aren't all "modules" — some are kernel services, some are experience surfaces, some are intelligence. Correct placement is what keeps the build clean:

| Your area | Lands in | As |
|---|---|---|
| Admin Center, Event Bus, AI Providers, API Mgmt, Integrations, Feature Flags, Monitoring, Security Center, Data Governance, Config Versioning, Backup, Tenants, Marketplace | **L1 Kernel/Platform** | platform services + the Admin UI over them |
| Document Control **substrate** (storage, versioning, OCR, AI classification, search) | **L1 Kernel** | DMS service (the *module* sits on top — see L2) |
| CRM & Sales, Tendering & Estimation, Engineering, Projects, Construction Control, Procurement, **Subcontracts**, Inventory, Finance, HR, Fleet, Assets, AMC & Service, HSE, Quality, Document Control | **L2 Business Modules** (16) | bounded contexts, each owns its schema + events |
| AI Center, Agents, Knowledge Graph, Event Intelligence, Forecasting, Anomaly, Risk Intelligence, Executive Copilot | **L3 Intelligence** | read-only consumers + proposers |
| Pricing Intelligence (IEC), CBS, Client Profitability, Tender Scoring, Document Intelligence | **L4 Optimization** | read-only analytics/proposals |
| Modern UI shell, BI & Analytics dashboards, Customer Portal, Supplier Portal, Mobile Workforce | **L5 Experience** | main web app + 3 separate portal/mobile apps |

**Net:** **16 business modules**, a platform kernel, the AI brain, and **4 experience apps** (main web + customer portal + supplier portal + mobile field).

---

## 2. Business modules (L2) — bounded contexts, pages, events

Each module owns a Postgres schema; cross-module data flows by **event or API contract only** (no joins). "Emits" lists representative events; "Reads" lists what it subscribes to.

### 2.1 CRM & Sales  `schema: crm`
**Pages:** Dashboard · Leads · Opportunities · Activities · Calls · Meetings · Customers · Contacts · Competitors · Quotations · Sales Orders · Pipeline · Forecast · Sales Targets · Customer Segments · **Marketing**(Campaigns · Email · SMS · WhatsApp · Lead Sources · ROI).
**Emits:** `crm.lead.created`, `crm.opportunity.won`, `crm.quote.sent`, `crm.sales_order.confirmed`.
**Reads:** `estimating.quote.priced` (to surface quotes), `optimization.client.profitability_updated`.

### 2.2 Estimating & Tendering  `schema: estimating`  ⭐ contractor-critical
**Pages:** Tender Dashboard · Tender Register (Invitations · Opportunities · Public · Private) · **Bid/No-Bid (AI)** · Tender Documents · **BOQ Import (Excel/PDF/OCR)** · Estimation (Material · Labour · Equipment · Subcontract · Indirect · Overheads · Risk · Margin) · Vendor RFQ · Vendor Comparison · Bid Review · Submission · Award Tracking · Lessons Learned.
**Emits:** `estimating.tender.registered`, `estimating.bid.decided`, `estimating.quote.priced`, `estimating.tender.awarded`.
**Reads:** `procurement.supplier_quote.received`, `optimization.pricing.rate_proposed` (IEC), `intelligence.bid.scored`.

### 2.3 Engineering  `schema: engineering`  ⭐ MEP-critical
**Pages:** Dashboard · Shop Drawings · Material Submittals · Method Statements · RFI · Technical Queries · Design Changes · Consultant Comments · Drawing Register · Revision Control · Engineering Workflows · Approvals. *(NCR raised here, owned by Quality.)*
**Emits:** `engineering.submittal.status_changed`, `engineering.rfi.raised`, `engineering.drawing.revised`.
**Reads:** `doccontrol.transmittal.sent`, `projects.milestone.due`.

### 2.4 Projects  `schema: projects`
**Pages:** Dashboard · WBS · **CBS** · Budget · Baseline · Progress · Productivity · Cost Control · **EVM** · Delay Analysis · **EOT Claims** · **Variations (client VOs)** · Revenue · Cash Flow · Forecast · Resource Planning · Risk Register · Closeout.
**Emits:** `projects.progress.updated`, `projects.variation.approved`, `projects.budget.overrun`, `projects.completed`.
**Reads:** procurement/finance/HR/site events to compute earned value + cost.

### 2.5 Construction / Site Control  `schema: site`
**Pages:** Daily Reports · Site Diary · Manpower (site) · Equipment (site) · Material Consumption · Progress Photos · Delays · Productivity · Site Inspections · Site Instructions.
**Emits:** `site.daily_report.submitted`, `site.material.consumed`, `site.delay.logged`.
**Reads:** `inventory.issue.posted`, `hr.attendance.posted`.

### 2.6 Procurement  `schema: procurement`
**Pages:** Vendor Registration · Evaluation · Performance · PR · RFQ · Bid Comparison · PO · **Blanket PO** · **Framework Agreements** · **Call-Off Orders** · Contracts · 3-Way Match · Payables hand-off.
**Emits:** `procurement.po.approved`, `procurement.grn.received`, `procurement.supplier_quote.received`, `procurement.match.exception`.
**Reads:** `estimating.tender.awarded`, `inventory.stock.low`, `site.material.consumed`.

### 2.7 Subcontracts  `schema: subcontracts`  ⭐ big missing module
**Pages:** Subcontract Register · **Payment Certificates (IPC)** · **Retention** · Subcontract Variations · Claims · Back-charges · Performance Evaluation.
**Emits:** `subcontracts.ipc.certified`, `subcontracts.retention.released`, `subcontracts.variation.approved`.
**Reads:** `projects.progress.updated`, `finance.payment.recorded`.

### 2.8 Inventory  `schema: inventory`  (MEP-aware)
**Pages:** Items · Multi-Warehouse · **Site Stores** · Transfers · Reservations · Reorder · Batch · Serial · **Cable Drums** · Electrical/MEP Materials · **Tool Store** (Issue/Return) · Consumption.
**Emits:** `inventory.stock.low`, `inventory.movement.posted`, `inventory.issue.posted`, `inventory.dead_stock.flagged`.
**Reads:** `procurement.grn.received`, `site.material.consumed`.

### 2.9 Finance  `schema: finance`
**Pages:** GL · AP · AR · VAT · Cash · Bank · Reconciliation · Budget · **Cost Centers · Profit Centers** · **Intercompany** · **Consolidation** · Fixed Assets (GL) · **Bonds** · Retention · **Project Finance · WIP · Revenue Recognition (IFRS 15) · IFRS support**.
**Emits:** `finance.invoice.created`, `finance.payment.recorded`, `finance.journal.posted`, `finance.budget.exceeded`.
**Reads:** events from procurement/subcontracts/projects/inventory/HR for postings.

### 2.10 HR & Payroll  `schema: hr`
**Pages:** Employees · Recruitment · Payroll · Leave · Attendance · Overtime · **Visa/Permit Tracking** · **Labour Camp** · Training · Certifications · Medical · Assets Issued · Timesheets · EOSB/Gratuity.
**Emits:** `hr.payroll.run`, `hr.visa.expiring`, `hr.attendance.posted`.
**Reads:** `site.daily_report.submitted` (site manpower reconciliation).

### 2.11 Fleet  `schema: fleet`
**Pages:** Vehicles · Equipment Fleet · Drivers · Fuel · Maintenance · **GPS** · **Salik** · Fines · Utilization · TCO.
**Emits:** `fleet.maintenance.due`, `fleet.fine.registered`.
**Reads:** `hr.employee.updated` (driver↔employee link by id).

### 2.12 Assets  `schema: assets`  (FM/AMC)
**Pages:** Asset Register · Lifecycle · Warranty · **Calibration** · Maintenance · Inspection · History · Depreciation/Disposal.
**Emits:** `assets.warranty.expiring`, `assets.calibration.due`.

### 2.13 AMC & Service  `schema: service`
**Pages:** Service Contracts · **Dispatch Board** · **Route Planning** · **Mobile Technician** · PPM · SLA · Call Center · Tickets · Billing · Renewals · Profitability · **IoT / Remote Monitoring**.
**Emits:** `service.ticket.raised`, `service.sla.breached`, `service.ppm.due`.
**Reads:** `assets.warranty.expiring`, customer-portal ticket submissions.

### 2.14 HSE  `schema: hse`  ⭐ critical UAE, missing
**Pages:** Dashboard · Incident Management · Near Miss · Risk Assessment · **PTW (Permit to Work)** · Toolbox Talks · Training · Inspections · Observations · **CAPA** · Analytics.
**Emits:** `hse.incident.reported`, `hse.ptw.issued`, `hse.capa.raised`.
**Reads:** `site.daily_report.submitted`, `hr.training.recorded`.

### 2.15 Quality  `schema: quality`  ⭐ missing
**Pages:** **NCR · CAR** · **Inspection Requests (IR)** · **ITP / QA Plans** · Test Reports · Checklists · **Snagging / Punch List** · Closeout.
**Emits:** `quality.ncr.raised`, `quality.ir.approved`, `quality.snag.closed`.
**Reads:** `engineering.submittal.status_changed`, `site.inspection.logged`.

### 2.16 Document Control  `schema: doccontrol`  (on the L1 DMS substrate)
**Pages:** Drawing Register · Submittals log · **Transmittals** · Correspondence (in/out) · Revisions · Approval Workflow · Search. *(Storage, OCR, AI-classification, version-store = kernel DMS; this module owns the construction workflows.)*
**Emits:** `doccontrol.transmittal.sent`, `doccontrol.correspondence.logged`.
**Reads:** `engineering.drawing.revised`, every module's document attach events.

---

## 3. Ownership & de-duplication (resolving the overlaps)

The same word appears across lists — each gets **one** owner; others link by id/event:

| Concept | Owner | Others |
|---|---|---|
| **Variations** | client VO → **Projects**; subcontract VO → **Subcontracts** | distinct aggregates |
| **Retention** | certificate logic → **Subcontracts**; GL/cash → **Finance** | event-linked |
| **NCR / CAR** | **Quality** | Engineering & Site *raise/link* only |
| **Profitability** | analytics → **L4 Optimization** (client/project) | CRM & Finance *display* read-models |
| **Warranty** | asset → **Assets**; service → **AMC**; project DLP → **Projects** | three different warranties |
| **Calibration** | **Assets** | Inventory tool-store links by id |
| **Documents** | bytes/version/OCR → **Kernel DMS**; construction workflow → **Document Control** | every module attaches via DMS |
| **Dashboards** | operational → each module; executive/cross-module → **BI (L5)** | BI reads read-models, not tables |

---

## 4. Kernel / Platform (L1) — the Admin Center controls all of this

Platform-grade, beyond the current admin: **Users · Roles · Permissions · Workflows · Forms · Templates · Rules · Numbering · Audit** *(have)* **+ Tenants · Modules · Marketplace · AI Providers · Agents · API Management · Integrations · Event Bus · Feature Flags · Monitoring · Security Center · Data Governance · Config Versioning · Backup & Recovery**. Plus the **DMS substrate** (storage/version/OCR/classification/search) that Document Control and every module build on.

---

## 5. Intelligence (L3) + Optimization (L4)

**AI Command Center** surfaces: AI Agents · AI Provider Manager · Knowledge Graph · Event Intelligence · Forecasting · Anomaly Detection · **Pricing Intelligence (IEC)** · **Document Intelligence (OCR/extract/classify)** · Risk Intelligence · **Executive Copilot**. All **read events + read-models and propose** through module gates — never write core. (The `ai-provider.ts` substrate already drafted becomes the provider manager's engine.)

---

## 6. Experience (L5) — modern 2026 enterprise UI

**Drop ERP-grid styling.** Design language blends: **Linear** (speed, keyboard-first), **Notion** (workspace/blocks), **ClickUp** (dashboards), **ServiceNow** (enterprise ops), **Dynamics 365** (module breadth). One token system, **no dual-CSS debt**.

**Shell:**
- **Left rail** (collapsible): Dashboard · Workspace · CRM · Tendering · Engineering · Projects · Procurement · Inventory · Finance · HR · Fleet · Assets · AMC · HSE · Quality · Documents · Analytics · AI Center · Admin.
- **Top bar:** Global Search · **Command Palette (⌘/Ctrl-K)** · Universal Inbox · Real-time Notifications · Company Switcher · Theme (Dark/Light + density) · User.
- **Right dock:** **AI Copilot sidebar** (context-aware, ask/act).
- **Multi-tab workspace** (open records as tabs) · **Work Center** (one queue across tasks/approvals/RFQs/IPCs/tickets/overdue).

**Separate apps (monorepo `apps/`):**
- **Customer Portal** — view/approve quotations · invoices · AMC tickets · projects · documents.
- **Supplier Portal** — receive RFQ · submit quote · view PO · submit invoice · track payment.
- **Mobile Workforce** (offline-first PWA) — daily reports · photos · attendance · snags · PTW · technician dispatch.
- **BI & Analytics** — Executive · CFO · COO · Project · Procurement · AMC · Sales · AI dashboards (on read-models).

---

## 7. Build sequence (tiered — all of it eventually; this is the order)

| Tier | Modules | Why this order |
|---|---|---|
| **T0 Kernel** | tenancy · auth/RBAC+ABAC · event store+outbox · workflow · numbering · audit · DMS substrate · Admin core | nothing works without the OS |
| **T1 Deal→Deliver core** | CRM/Sales → **Estimating/Tendering** → Projects → Procurement → **Subcontracts** → Inventory → Finance | the contractor money-path, end to end |
| **T2 Control & compliance** | **Engineering** · **Document Control** · **Construction/Site** · **HSE** · **Quality** | what makes it Tier-1 for MEP/UAE |
| **T3 Operate & assets** | HR/Payroll · Fleet · Assets · **AMC/Service** | run the workforce & FM/AMC side |
| **T4 Intelligence & Optimization** | AI Center · IEC pricing · CBS · profitability · forecasting · Document Intelligence | the AURA differentiators |
| **T5 Edges** | Customer Portal · Supplier Portal · Mobile Workforce · BI depth · IoT · Marketing automation | reach & polish |

Each tier still ships **one clean vertical slice at a time** (the module template from the blueprint): domain → services → events → api → ui → tests.

---

## 8. Still gating everything: the §13 decision points

Scope is now locked; **architecture is unchanged**. Before I scaffold T0 I still need your call on the five Decision Points in the blueprint (backend stack, data ownership, **repo location**, tooling, Supabase). Say *"go with your recommendations"* or override, and Phase 0 begins.

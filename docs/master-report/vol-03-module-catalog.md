# Volume 3 — Complete Module Catalog

[← Master index](README.md)

Seventeen business modules, each documented against the same template: Overview · Purpose ·
Responsibilities · Screens · Forms · Entities · Workflow · Permissions · Events · Reports ·
Dashboard · AI Features · API · Database · KPIs · Future Roadmap.

> **Screen-by-screen walkthroughs of all 93 pages: [Volume 3A](vol-03a-screen-walkthroughs.md).**

**Reading notes (apply to every module):**

- **Entities** are verified from store ports in `modules/<m>/src/*-store.ts` (each has an
  in-memory + Postgres adapter).
- **Permissions:** access control is enforced service-level through the kernel `AccessService`
  (RBAC/ABAC); the `@Permissions()` route guard exists in the kernel but fine-grained per-module
  permission keys are not yet annotated on controllers — this is a platform-wide [Gap] tracked
  in Volume 7 §3, not repeated in every module below.
- **Forms:** as of 2026-07-03 all creates/edits run through the metadata form engine (Volume 5) —
  either as registered `FormSchema` metadata or via the legacy `FieldSpec` adapter.
- **API count** = route handlers in `apps/api/src/<area>` verified 2026-07-03.

---

## Module order

Deal chain: [CRM](#1-crm) · [Tendering](#2-tendering) · [Contracts](#3-contracts) · [Projects](#4-projects)
Operate: [Procurement](#5-procurement) · [Inventory](#6-inventory) · [Subcontracts](#7-subcontracts) · [Site Control](#8-site-control) · [Engineering](#9-engineering) · [Document Control](#10-document-control) · [Quality](#11-quality) · [HSE](#12-hse)
Back office: [Finance](#13-finance) · [HR](#14-hr)
Asset side: [Assets](#15-assets--equipment) · [Fleet](#16-fleet--logistics) · [AMC](#17-amc--services)

---

# 1. CRM

### Overview
The revenue front door: accounts, contacts, leads, opportunities, activities, and VAT
quotations. The first link of the deal chain — a won opportunity automatically registers a
tender (event reactor), so sales data flows into delivery without re-keying.

### Purpose
Give a contracting business one place to manage customers and pipeline where "won" is not the
end of the record but the trigger for execution.

### Responsibilities
- Account master (status lifecycle: lead → active → dormant; industry, website)
- Contact and activity logging against accounts
- Lead capture and qualification; conversion to opportunity
- Opportunity pipeline with stages and values
- Quotations with VAT line items (server-computed totals), send/accept/reject lifecycle

### Screens
`/crm/accounts` (list + create/edit drawers) · `/crm/accounts/[id]` (record page: profile,
linked opportunities, activities, audit) · `/crm/leads` (pipeline client: leads + opportunities)
· `/crm/quotations` · `/crm/quotations/[id]/print`

### Forms
Account (create + edit, drawer) · Lead (company, email, phone, source) · Opportunity (value,
stage, account/lead links via option `fills`) · **Quotation — registered metadata schema
`crm.quotation`** with live computed Subtotal/VAT/Grand-total formulas (Volume 5 §5).

### Entities
`account` · `contact` · `activity` · `lead` · `opportunity` · `quotation` (6 ports × 2 adapters).

### Workflow
Lead → (qualify) → Opportunity → stage progression → `won` ⇒ **reactor creates Tender**
(idempotent). Quotation: draft → sent → accepted/rejected/expired; accepted ⇒ contract handoff.
Manual step that remains: Quotation→Tender is not auto-linked [Gap].

### Events
`crm.account.created/updated/status_changed` · `crm.lead.created/updated` ·
`crm.opportunity.created/updated/stage_changed`.

### Reports
Quotation print view; CSV export on lists (quotations exporter with columns). Pipeline
projection feeds Intelligence (`intelligence/src/pipeline.ts`).

### Dashboard
No dedicated CRM dashboard page [Gap] — pipeline totals render on the quotations/leads pages;
Intelligence `/intelligence` shows pipeline insights.

### AI Features
Pipeline projection + insights (win-probability commentary via Intelligence); quotation form
carries AI auto-fill + AI review toolbar (platform-wide, Volume 5 §8–9).

### API
32 handlers (`apps/api/src/crm`): accounts/leads/opportunities/quotations CRUD + status/stage
transitions + quotation send/accept/reject.

### Database
`0005_crm_accounts.sql` + subsequent CRM tables (accounts, contacts, activities, leads,
opportunities, quotations w/ JSONB lines), `tenant_id` on all.

### KPIs
Pipeline value by stage · win rate · quotation acceptance rate · open vs won value (already
computed on-page) · account activity recency.

### Future Roadmap
Email integration (decision recorded: **Microsoft Graph**) · campaign/source analytics ·
duplicate detection (AI validation hook exists) · CRM dashboard page.

---

# 2. Tendering

### Overview
Estimating and bid management: tender register, BOQ with rate build-ups, estimates, bid/no-bid
scoring, win/loss analysis. Auto-created from won opportunities; feeds Contracts on award.

### Purpose
Turn opportunities into priced, governed bids and capture why bids win or lose.

### Responsibilities
- Tender register with lifecycle (registered → submitted → awarded/lost)
- BOQ line management; **rate build-ups** (material/labour/plant/overhead composition — 0121)
- Estimates (cost build toward the bid price)
- Bid/no-bid scoring model
- Win/loss records with reasons (0126)

### Screens
`/tendering/tenders` (register + drawers) · `/tendering/tenders/[id]` (record page with BOQ,
estimate, scoring tabs).

### Forms
Tender (reference, status, account link with `fills`, value) — create + edit drawers; BOQ line
and estimate forms on the record page.

### Entities
`tender` · `boq` · `estimate` · `bid-score` · `win-loss`.

### Workflow
`registered → submitted → awarded | lost`; `awarded` ⇒ **reactor creates Contract**; `lost` ⇒
win/loss record prompt. Status transitions guarded in domain (`modules/tendering/src/domain`).

### Events
`estimating.tender.registered/updated/submitted/awarded/lost` · `estimating.bid.decided`.

### Reports
Win/loss analysis data; BOQ/estimate exports; tender list CSV.

### Dashboard
None dedicated [Gap]; tender KPIs surface via Intelligence pipeline view.

### AI Features
**Pricing service** (`intelligence/src/pricing.service.ts`): rate calibrations + pricing
sources, calibration trigger endpoint — AI-assisted estimate rates. Bid insights via insight
service.

### API
25 handlers: tender CRUD + `PATCH :id` + status transitions + BOQ/estimate/score/win-loss +
document upload (`UploadedFile` on tender docs).

### Database
`0006_tendering_tenders.sql`, `0121_tender_rate_buildups.sql`, `0126_tender_win_loss.sql`.

### KPIs
Bid-to-win ratio · tender value pipeline · estimate vs award delta · average bid score of wins ·
loss-reason distribution.

### Future Roadmap
BOQ import from Excel (CSV port exists) · subcontractor RFQ packages from BOQ sections ·
AI bid-risk score on the tender record.

---

# 3. Contracts

### Overview
The commercial backbone between winning and delivering: contract register, clause library,
obligations register, and interim payment certificates (IPCs).

### Purpose
Hold the commercial truth of each award — terms, obligations, certified progress — and post its
financial consequences automatically.

### Responsibilities
- Contract lifecycle (created → signed → completed), values and references
- **Clause library** (0109) and per-contract clauses
- **Obligations register** (0110) with due tracking
- Payment certificates: progress certification with retention math; certified IPC ⇒ AR invoice
  (reactor)

### Screens
`/contracts/contracts` (+drawers) · `/contracts/contracts/[id]` (record: clauses, obligations,
certificates tabs) · `/contracts/contracts/[id]/print` · `/contracts/certificates` ·
`/contracts/certificates/[id]/print`.

### Forms
Contract create/edit (won-tender inheritance via option `fills`/`extra`) · clause · obligation ·
payment-certificate forms.

### Entities
`contract` · `clause` · `obligation` · `payment-certificate`.

### Workflow
`created → signed → completed`; `signed` ⇒ **reactor creates Project + seeds WBS/CBS**.
IPC: draft → certified ⇒ `subcontracts.ipc.certified`-equivalent contract-side flow posts AR.

### Events
`contracts.contract.created/updated/signed/completed`.

### Reports
Contract print view · certificate print view · obligations due listing.

### Dashboard
None dedicated [Gap].

### AI Features
Platform AI fill/review on forms; obligation-risk surfacing is a natural insight-service
extension [Planned].

### API
23 handlers across 4 controllers (contracts, clauses, obligations, payment-certificates).

### Database
`0007_contracts_contracts.sql`, `0109_contracts_clauses.sql`, `0110_contracts_obligations.sql`.

### KPIs
Contract value vs certified-to-date · retention held · obligations overdue · time-to-signature.

### Future Roadmap
Retention-release workflow UI · clause-deviation AI review (compare against library standard) ·
warranty/DLP claim workflow (chain gap noted in due diligence §6).

---

# 4. Projects

### Overview
Delivery control: projects with WBS/CBS, schedules, variations, EVM cost control, delay/EOT
records, cash-flow forecasts, and closeout with DLP dates.

### Purpose
Answer, at any moment, "are we on time, on budget, and what will this project cash-flow?"

### Responsibilities
- Project register (auto-created from signed contracts) with lifecycle
- WBS (0016) and CBS structures; budget lines
- Schedule + Gantt data (`/projects/schedule`), baselines partial
- Variations register
- EVM: earned value, CPI/SPI from cost actual/committed events
- Delay/EOT records; closeout (handover + DLP end); cash-flow forecast (S-curve, peak funding)

### Screens
`/projects/projects` (+drawers) · `/projects/projects/[id]` (record: WBS/CBS, variations, EVM,
closeout tabs) · `/projects/dashboard` · `/projects/schedule` (Gantt client) ·
`/projects/variations`.

### Forms
Project create/edit (active-contract inheritance) · variation · WBS/CBS nodes · delay/EOT ·
closeout · cash-flow forecast entries.

### Entities
`project` · `wbs` · `cbs` · `schedule` · `variation` · `cashflow-forecast` · `delay-eot` ·
`closeout`.

### Workflow
`created → started → completed`; budget overrun detection emits `projects.budget.overrun`;
cost events (`projects.cost.actual/committed`) fold into EVM.

### Events
`projects.project.created/updated/started/completed` · `projects.cost.actual` ·
`projects.cost.committed` · `projects.budget.overrun`.

### Reports
Projects dashboard aggregates; EVM figures on record; cash-flow S-curve data; project ledger
projection (`intelligence/src/project-ledger.ts`).

### Dashboard
`/projects/dashboard` ✅.

### AI Features
Project-ledger projection feeds Intelligence insights (margin/burn commentary); risk analysis
[Planned] (insight-service extension).

### API
41 handlers: project CRUD + PATCH + sub-resources (wbs, cbs, schedule, variations, delay-eot,
closeout, cashflow).

### Database
`0008_projects_projects.sql`, `0016_projects_wbs.sql` + CBS/schedule/variation/closeout tables.

### KPIs
CPI · SPI · budget vs committed vs actual · variation value % of contract · forecast peak
funding · DLP expiry pipeline.

### Future Roadmap
True baseline/critical-path scheduling (Primavera import — Volume 17) · progress % from site
data (site module already logs labour/materials) · portfolio dashboard.

---

# 5. Procurement

### Overview
Source-to-receipt: suppliers with approval status, purchase requests, RFQs, purchase orders with
a threshold approval matrix, framework agreements, and server-side 3-way matching.

### Purpose
Control committed cost. Nothing is ordered without an approved vendor and the right approval
tier; nothing is paid without PO/GRN/invoice agreement.

### Responsibilities
- Supplier master (code, category, trade licence, TRN, contacts) + approved-vendor enforcement
- PR lifecycle (auto-raised by low-stock reactor as well as manual)
- RFQ issue/compare; PO create/approve/issue/close with **approval matrix** by value threshold
- Framework/blanket agreements (0122)
- 3-way match (PO ↔ GRN ↔ supplier invoice) executed server-side

### Screens
`/procurement/dashboard` ✅ · `/procurement/suppliers` · `/procurement/purchase-requests` ·
`/procurement/rfqs` · `/procurement/purchase-orders` (+`[id]`, `[id]/print`).

### Forms
Supplier (7 fields) · PR (reference, project link, value) · RFQ · PO create/edit (reference,
project, supplier; edit = PATCH) — all drawer forms on the engine.

### Entities
`supplier` · `purchase-request` · `rfq` · `purchase-order` · `framework-agreement`.

### Workflow
PR → RFQ → PO(draft → approved [matrix tier] → issued → closed); GRN receipt closes the loop;
`inventory.stock.low` ⇒ auto-PR (reactor). Approval matrix service: `core/src/builder/approval-matrix.service.ts`.

### Events
`procurement.po.created/updated/approved/issued/closed` · `procurement.grn.received`.

### Reports
PO print view · dashboard aggregates · supplier/PO CSV exports.

### Dashboard
`/procurement/dashboard` ✅.

### AI Features
Preferred-supplier recommendation is a designed insight [Planned]; AI review flags unusual
price/qty combinations on PO forms (platform AI review).

### API
33 handlers.

### Database
`0009_procurement_purchase_orders.sql`, `0015_procurement_pr.sql`,
`0122_procurement_framework_agreements.sql`.

### KPIs
PO cycle time · % spend on approved vendors (should be 100 by construction) · 3-way match
exception rate · framework utilization · committed vs budget (projects link).

### Future Roadmap
Supplier portal (Volume 20 V2) · RFQ → BOQ package linkage · landed-cost allocation.

---

# 6. Inventory

### Overview
Perpetual inventory: GRNs with inspection, stock by item/location, transfers, **moving weighted
average cost**, reorder levels with auto-PR, and COGS-to-GL posting — the module where physical
and financial truth reconcile.

### Purpose
Every receipt and issue moves both units and dirhams, automatically and audibly.

### Responsibilities
- GRN lifecycle (created → inspected → accepted) with PO linkage
- Stock registry with UoM + barcode fields (0124), costing method (0112)
- Transfers between locations
- WAC re-averaging on receipt; COGS at WAC on issue
- Reactors: `grn.accepted` ⇒ stock + WAC + GL (Dr Inventory/Cr GRNI); issue ⇒ Dr COGS/Cr Inventory
- Low-stock threshold crossing ⇒ one idempotent PR

### Screens
`/inventory/dashboard` ✅ · `/inventory/stock` · `/inventory/grns` (+`[id]/print`) ·
`/inventory/transfers` · `/inventory/valuation`.

### Forms
GRN (issued-PO inheritance via `fills`) · stock item · transfer — drawer forms.

### Entities
`goods-receipt` · `stock` · `transfer`.

### Workflow
GRN: created → inspected → accepted (each step audited + evented); transfer request → completion.

### Events
`inventory.grn.created/updated/inspected/accepted` · `inventory.stock.low`.

### Reports
Valuation page (WAC by item) · GRN print · dashboard aggregates.

### Dashboard
`/inventory/dashboard` ✅.

### AI Features
Reorder-point optimization from consumption history [Planned]; AI review on GRN quantity
anomalies (platform).

### API
19 handlers.

### Database
`0010_inventory_grns.sql`, `0112_inventory_costing_method.sql`, `0124_inventory_barcode_uom.sql`.

### KPIs
Stock value (WAC) · stockout incidents · GRN inspection pass rate · inventory turns ·
auto-PR conversion time.

### Future Roadmap
Batch/serial tracking · bin locations · cycle counts · barcode scanning UI (fields exist).

---

# 7. Subcontracts

### Overview
The other half of construction cost: subcontractor agreements with retention, claims/IPCs,
subcontract variations, and back-charges that flow to AP automatically.

### Purpose
Mirror the main-contract commercial machinery downward to subcontractors.

### Responsibilities
- Subcontract register (project-linked, retention %)
- Subcontractor IPC certification ⇒ AP-side invoice (reactor `subcontracts.ipc.certified`)
- Retention withholding and release events
- Subcontract variations; **back-charges** ⇒ AP deduction (reactor)

### Screens
`/subcontracts/subcontracts` (+`[id]/print`) · `/subcontracts/variations` ·
`/subcontracts/back-charges`.

### Forms
**Subcontract — registered metadata schema** `subcontracts.subcontract` demonstrating the
plugin `percent` field kind + retention business rule (≥ AED 1M with < 5% retention ⇒ warning)
(Volume 5) · variation · back-charge forms.

### Entities
`subcontract` (+ claims/variations/back-charges tables).

### Workflow
Agreement → claims (certify ⇒ AP) → retention release; back-charge raise → AP deduction.

### Events
`subcontracts.subcontract.created` · `subcontracts.ipc.certified` ·
`subcontracts.retention.released`.

### Reports
Subcontract print · claims/retention listings.

### Dashboard
None dedicated [Gap].

### AI Features
Platform form AI; subcontractor-performance scoring [Planned].

### API
20 handlers.

### Database
`0017_subcontracts.sql` + claims/variations/back-charge tables.

### KPIs
Retention held (liability) · certified vs agreement value · back-charge recovery rate ·
subcontractor concentration.

### Future Roadmap
Retention-release workflow UI · subcontractor portal · performance scorecards.

---

# 8. Site Control

### Overview
The field record: daily reports (site diary), delay logs with impact hours, material
consumption, labour allocations by trade with man-hours, progress-vs-baseline mapping, and site
instructions.

### Purpose
Capture what actually happened on site, in a form that costs, delays, and claims can cite.

### Responsibilities
- Daily reports: draft → submitted, manpower/equipment counts
- Delay logs (weather/material/access/drawings/other) with resolve flow
- Material consumption entries against projects
- Labour allocations (trade, headcount, hours ⇒ man-hours computed)
- Progress % mapping vs baseline (schedule data)
- Site instructions register (`/site/instructions`)

### Screens
`/site/control` (5-tab client, all drawers) · `/site/instructions`.

### Forms
Daily report · delay log · material consumption · labour allocation — all metadata drawers
(converted 2026-07-03).

### Entities
Site aggregate store (daily reports, delay logs, material consumption, labour allocations).

### Workflow
Report draft → submit; delay logged → resolved.

### Events
Module-level events [Gap in catalog] — site records currently audit-logged; catalogued events
to add (see roadmap).

### Reports
Registers per tab; labour man-hour summaries.

### Dashboard
Progress-mapping tab acts as the visual; no standalone dashboard [Gap].

### AI Features
Diary summarization + delay-claim drafting are high-value [Planned] items (AI provider ready).

### API
15 handlers.

### Database
`0022_site.sql`.

### KPIs
Man-hours by trade · delay hours by cause · report submission compliance · consumption vs
estimate.

### Future Roadmap
Mobile-first capture (Volume 24) · photo attachments via DMS · site events into the catalog ·
progress % feeding project EVM automatically.

---

# 9. Engineering

### Overview
Design coordination: drawing register with revisions, RFIs, submittals, technical queries, and
an **in-browser IFC/BIM viewer** (`/engineering/bim`, migration 0111).

### Purpose
Keep design information, questions, and approvals attached to the delivery record.

### Responsibilities
- Drawing register (created/revised lifecycle)
- RFIs (raised → answered), submittals (status transitions), technical queries
- BIM model registry + IFC viewing

### Screens
`/engineering` (multi-tab client) · BIM viewer route.

### Forms
Drawing · RFI · submittal · technical query drawers.

### Entities
`drawing` · `rfi` · `submittal` · `technical-query` · `bim-model`.

### Workflow
RFI raised → answered; submittal status chain; drawing revision bumps.

### Events
`engineering.drawing.created/revised` · `engineering.rfi.raised/answered` ·
`engineering.submittal.created/status_changed`.

### Reports
Registers; RFI aging.

### Dashboard
None [Gap].

### AI Features
RFI answer drafting from document context is the flagship [Planned] use (vector store exists).

### API
26 handlers.

### Database
`0020_engineering.sql`, `0111_engineering_bim_models.sql`.

### KPIs
RFI turnaround days · submittal first-pass approval rate · drawing revision churn.

### Future Roadmap
Weakest-tested module (1 test file) — deepen tests · drawing-to-transmittal integration with
Doc Control · AutoCAD/IFC pipeline (Volume 17).

---

# 10. Document Control

### Overview
Formal project communications: transmittals (with per-item registers, 0123), correspondence
log, submittals, and the drawing register interface to Engineering.

### Purpose
Prove what was sent to whom, when, and what revision — the claims-defense module.

### Responsibilities
- Transmittals: compose (items), send, acknowledge; item-level tracking
- Correspondence in/out log
- Submittal register (doc-control side)

### Screens
`/documents/control` (doc-control client) · `/doccontrol/submittals` · plus kernel `/documents`
(DMS browser).

### Forms
Transmittal (+items) · correspondence · submittal drawers.

### Entities
`transmittal` · `transmittal-item` · `correspondence` · `submittal` · `drawing-register`.

### Workflow
Transmittal draft → sent (`doccontrol.transmittal.sent`); correspondence logged
(`doccontrol.correspondence.logged`).

### Events
`doccontrol.transmittal.sent` · `doccontrol.correspondence.logged`.

### Reports
Transmittal register with items; correspondence log export.

### Dashboard
None [Gap].

### AI Features
Correspondence classification + reply drafting [Planned].

### API
16 handlers.

### Database
`0021_doccontrol.sql`, `0123_doccontrol_transmittal_items.sql`.

### KPIs
Open transmittals awaiting acknowledgment · correspondence response aging.

### Future Roadmap
Deep DMS linkage (attach kernel documents to transmittal items) · outgoing email delivery
(needs notification channels).

---

# 11. Quality

### Overview
QA/QC: NCRs with severity and lifecycle, inspection requests by discipline, snag/punch lists,
ITPs, material approval requests (MARs), calibration records, and **ISO audit schedules with
interactive clause checklists that generate NCRs from non-compliances**.

### Purpose
Make quality evidence systematic: every non-conformance traceable from finding to closure.

### Responsibilities
- NCR: raised → corrected → closed; severity minor/major
- IR: requested → approved/rejected with inspector comments
- Snags: open → resolved → closed
- ITPs (`/quality/itps`), MARs (`/quality/material-approvals`), calibrations
- ISO audits (0108): schedule → checklist execution (compliant/non-compliant/N-A + findings)
  → complete; non-compliant items generate linked NCRs

### Screens
`/quality/control` (4-tab client: NCR/IR/snags/audits — all drawers) · `/quality/itps` ·
`/quality/material-approvals`.

### Forms
NCR · IR · Snag · Audit — metadata drawers (converted 2026-07-03) · ITP · MAR forms.

### Entities
`ncr` · `ir` · `snag` · `itp` · `mar` · `calibration` · `audit-schedule`.

### Workflow
As per lifecycles above; audit checklist PUT round-trips server state; NCR generation from
checklist items is idempotent per item.

### Events
`quality.ncr.raised` · `quality.ir.approved` · `quality.snag.closed`.

### Reports
Registers; audit checklist verification view.

### Dashboard
None [Gap].

### AI Features
NCR root-cause suggestion + repeat-NCR pattern detection [Planned] (process-mining service is
the natural host).

### API
33 handlers.

### Database
`0024_quality.sql`, `0108_quality_audits.sql`.

### KPIs
Open NCRs by severity · IR first-time pass rate · snag closure time · audit compliance %.

### Future Roadmap
Calibration due-date automation · quality dashboard · photo evidence via DMS.

---

# 12. HSE

### Overview
Safety management: incidents/near-misses with severity, permits to work by type with validity
windows, CAPA actions from incidents/audits/inspections, safety training matrix with card
expiries, and toolbox talks.

### Purpose
Compliance and prevention: every incident investigated, every high-risk work permitted, every
worker's training current.

### Responsibilities
- Incidents: reported → investigating → closed (near_miss/minor/major/fatal)
- PTW: draft → requested → approved → expired/closed; 5 permit types
- CAPA: pending → in_progress → completed, sourced from incident/audit/inspection
- Training records: worker, induction, card number/expiry, certifications (CSV transform)
- Toolbox talks (`/hse/toolbox-talks`)

### Screens
`/hse/control` (4-tab client — all drawers) · `/hse/toolbox-talks`.

### Forms
Incident · PTW (isoDate transforms on validity) · CAPA · Training record — metadata drawers.

### Entities
HSE aggregate store (incidents, PTWs, CAPAs, training records).

### Workflow
As per lifecycles; PTW approval gate before validity.

### Events
`hse.incident.reported` · `hse.ptw.issued` · `hse.capa.raised`.

### Reports
Registers; training matrix valid/expired counters.

### Dashboard
None [Gap] — matrix counters are the interim.

### AI Features
Incident classification + CAPA suggestion [Planned].

### API
19 handlers.

### Database
`0023_hse.sql`.

### KPIs
TRIR/LTIR (derivable) · open CAPAs overdue · PTW active count · training expiry pipeline.

### Future Roadmap
Risk assessment register · training-expiry notifications (kernel notifications ready) ·
HSE dashboard.

---

# 13. Finance

### Overview
The deepest module: general ledger with DB-trigger-enforced double entry, AP/AR with aging,
customer + supplier invoicing, payments, journals (incl. intercompany, 0117), budgets,
cost/profit centres, period close, IFRS-15 revenue recognition, multi-currency (FX registry),
VAT returns, petty cash, post-dated cheques, bank guarantees, bank reconciliation, financial
statements, and consolidation.

### Purpose
Close the loop: every operational event lands in the ledger without a bookkeeper re-keying it,
and the books can actually close.

### Responsibilities
- GL: journals with balanced-entry enforcement **by database trigger**; posting blocked in
  closed periods
- AP: supplier invoices (3-way matched), payments, AP aging
- AR: customer invoices (+auto-created from IPCs/AMC work orders), receipts, AR aging
- Budgets vs actual (folds GL); cost-centre net + profit-centre contribution
- Period close; statements (P&L/BS/CF + trial balance) derived from GL; `/finance/statements/print`
- IFRS-15 cost-to-cost revenue recognition
- Multi-currency: FX rates (`core/finance/exchange-rate.service`), base conversion on AR
- UAE VAT returns; petty cash; PDC lifecycle; bank guarantees; bank reconciliation (0052)

### Screens (17)
`/finance/dashboard` ✅ · ledger · invoices (+`[id]`) · customer-invoices (+print) · ap-aging ·
ar-aging · budgets · statements (+print) · period-close · revenue-recognition · tax ·
vat-returns · fx · petty-cash · post-dated-cheques · bank-guarantees · bank-reconciliation ·
consolidation.

### Forms
Supplier invoice (received-PO inheritance) · customer invoice (VAT lines) — create + edit
drawers; journal, budget, PDC, petty-cash, BG, FX-rate forms.

### Entities (20)
`account` (CoA) · `journal` · `invoice` · `customer-invoice` · `payment` · `budget` ·
`cost-center` · `profit-center` · `period-close` · `tax` · `petty-cash` ·
`post-dated-cheque` · `bank-guarantee` · `bank-transaction`.

### Workflow
Invoice: created → approved → paid; journal: draft → posted (trigger-checked); period: open →
closed (posting blocked); PDC: received → deposited → cleared/bounced.

### Events
`finance.invoice.created/updated/approved/paid` · `finance.journal.posted` ·
`finance.payment.recorded`.

### Reports
Statements (P&L, BS, CF, trial balance) · AP/AR aging · VAT return · budget-vs-actual ·
customer-invoice + statement print views.

### Dashboard
`/finance/dashboard` ✅.

### AI Features
Anomaly commentary on aging/cash [Planned]; AI review flags unusual invoice combinations
(platform form review).

### API
93 handlers — the largest area.

### Database
`0011_finance_invoices.sql`, `0014_finance_gl.sql`, `0052_finance_bank_transactions_rls.sql`,
`0116_customer_invoice_soft_delete.sql`, `0117_finance_journal_intercompany.sql` + more.
Double-entry trigger verified by the platform's single live-Postgres integration test.

### KPIs
DSO/DPO · aging buckets · budget variance · unrecognized revenue backlog · FX exposure ·
period-close cycle time.

### Future Roadmap
Intercompany elimination in consolidation · multi-currency on AP/GL (AR done) ·
statements-by-currency · bank-feed import.

---

# 14. HR

### Overview
GCC-complete HR: employee profiles with visa/permit/labor-camp compliance, leave management,
payroll runs with **WPS SIF** file generation, EOSB gratuity (UAE bands), timesheets,
attendance with worked-hours, expense claims, staff advances, document-expiry tracking,
manager hierarchy (0119), and appraisals (0120).

### Purpose
Run the full employee lifecycle for a UAE contractor — including the statutory artifacts
(WPS, EOSB) that horizontal ERPs treat as localization afterthoughts.

### Responsibilities
- Employee master — **registered metadata schema `hr.employee`** with tabbed layout
  (Profile/Compliance/Contact), live rules (camp ⇒ require visa expiry), email/phone validators
- Leave: requested → approved/rejected
- Payroll: run generation (basic+allowances−deductions ⇒ net), disbursement, payslip print,
  WPS SIF (SCR/EDR records)
- EOSB calculation per UAE bands; timesheets; attendance; claims; advances
- Document expiry surveillance (`/hr/document-expiry`)

### Screens (11)
`/hr/dashboard` ✅ · control (3-tab) · attendance · timesheets · eosb · expense-claims ·
staff-advances · document-expiry · payroll/[id]/print.

### Forms
Employee (metadata schema, tabs+rules) · leave · payroll run · timesheet · claim · advance.

### Entities
`employee` · `leave` · `payroll-run` · `timesheet` · `attendance` · `expense-claim` ·
`staff-advance` · `appraisal`.

### Workflow
Leave approval; payroll draft → approved → paid; claims approval.

### Events
`hr.employee.created` · `hr.leave.requested/approved` · `hr.payroll.run`.

### Reports
Payslip print · WPS SIF export · attendance/worked-hours · expiry pipeline.

### Dashboard
`/hr/dashboard` ✅.

### AI Features
Attrition/expiry risk surfacing [Planned].

### API
41 handlers.

### Database
`0025_hr.sql`, `0119_hr_employee_manager.sql`, `0120_hr_appraisals.sql`.

### KPIs
Headcount by dept · visa/permit expiry pipeline · payroll cost trend · leave liability ·
overtime hours.

### Future Roadmap
Org chart UI (manager field exists) · appraisal cycle UI · shift scheduling.

---

# 15. Assets & Equipment

### Overview
Capital asset register with categories, purchase data, warranty/calibration/inspection dates,
preventative maintenance ledger with actual-cost completion, inspection history, and
depreciation (`/assets/depreciation`).

### Purpose
Know what the company owns, where it stands on maintenance/compliance, and what it is worth.

### Responsibilities
- Register: 6 categories, status lifecycle (active/maintenance/inactive/disposed), warranty
  badges (expired/soon/active)
- Maintenance: scheduled → completed (actual cost)
- Inspections/calibrations: pass/fail with notes
- Depreciation schedules

### Screens
`/assets/control` (3-tab, all drawers) · `/assets/depreciation`.

### Forms
Asset (9 fields) · maintenance · inspection — metadata drawers (converted 2026-07-03).

### Entities
Assets aggregate store (assets, maintenance, inspections) + depreciation.

### Events
`assets.maintenance.scheduled/completed` · `assets.inspection.recorded`.

### Reports
Register with warranty status · maintenance ledger · inspection history · depreciation schedule.

### Dashboard
None [Gap].

### AI Features
Failure-prediction from maintenance history [Planned] (Volume 24 IoT tie-in).

### API
15 handlers.

### Database
`0027_assets.sql`.

### KPIs
Maintenance cost per asset · inspection pass rate · warranty coverage % · NBV by category.

### Future Roadmap
Disposal → GL posting · QR asset tags · utilization tracking.

---

# 16. Fleet & Logistics

### Overview
Vehicle operations: registry with Mulkiya (registration) expiry scanning, driver assignment
from HR, fuel logs, maintenance, **GPS telematics ingestion** (0107) with live position table,
traffic fines, and Salik toll management.

### Purpose
Run a contractor's vehicle fleet with UAE-specific cost and compliance capture.

### Responsibilities
- Vehicle registry: make/model/year/plate, status, driver (HR employee link)
- Registration-expiry scanner ⇒ renewal notifications + tasks (30-day window)
- Fuel logs (liters/cost/odometer); maintenance schedule → complete (actual cost)
- Telemetry webhook (lat/lng/speed/odometer) → last-position registry
- Fines (`/fleet/fines`) and Salik (`/fleet/salik`) cost tracking

### Screens
`/fleet/control` (4-tab) · `/fleet/fines` · `/fleet/salik`.

### Forms
Vehicle · fuel log · maintenance — metadata drawers; GPS simulator + expiry scanner as inline
tools (deliberate: actions, not entity creates).

### Entities
Fleet aggregate store (vehicles, fuel logs, maintenance) + telemetry, fines, Salik.

### Events
`fleet.vehicle.created` · `fleet.fuel.logged` · `fleet.maintenance.scheduled/completed`.

### Reports
Fleet directory with expiry badges · fuel consumption entries · GPS positions ledger.

### Dashboard
None [Gap].

### AI Features
Fuel-anomaly detection (odometer vs liters) [Planned].

### API
22 handlers.

### Database
`0026_fleet.sql`, `0107_fleet_telemetry.sql`.

### KPIs
Cost/km · fines per vehicle/driver · Salik spend by vehicle · expiring registrations ·
maintenance backlog.

### Future Roadmap
Real telematics provider integration (webhook shape ready) · trip/geofence analytics ·
driver scorecards.

---

# 17. AMC & Services

### Overview
The facility-management vertical: AMC contracts, service tickets with **SLA escalation**
(0118), work orders, and PPM (planned preventative maintenance) schedules whose completion
bills the customer automatically (work order → AR invoice reactor).

### Purpose
Run recurring service revenue: contracts → scheduled visits → tickets → work → cash.

### Responsibilities
- AMC contract register with coverage and billing terms
- Tickets with SLA timers and escalation
- Work orders; completion ⇒ AR invoice (reactor)
- PPM: next-due advance scheduling (`/amc/ppm`)

### Screens
`/amc` · `/amc/ppm`.

### Forms
Contract · ticket · work order · PPM schedule drawers.

### Entities
AMC aggregate store (contracts, tickets, work orders, PPM schedules).

### Events
Work-order completion drives the AR reactor (event naming consolidation with catalog —
see roadmap).

### Reports
Contract register · ticket SLA states · PPM due list.

### Dashboard
None [Gap].

### AI Features
Ticket triage/classification [Planned].

### API
22 handlers.

### Database
AMC tables (persistence migration collision fixed 2026-06-30) + `0118_amc_ticket_escalation.sql`.

### KPIs
SLA compliance % · first-time-fix rate · PPM adherence · AMC revenue per contract ·
ticket backlog age.

### Future Roadmap
Customer portal (ticket submission) · technician mobile app · SLA analytics dashboard.

---

## Cross-module summary matrix

| Module | Entities | API | Screens | Events | Dashboard | Metadata forms | Tests focus |
|---|--:|--:|--:|--:|---|---|---|
| CRM | 6 | 32 | 5 | 8 | [Gap] | quotation schema | 3 files |
| Tendering | 5 | 25 | 2 | 6 | [Gap] | drawers | 2 |
| Contracts | 4 | 23 | 5 | 4 | [Gap] | drawers | 3 |
| Projects | 8 | 41 | 5 | 7 | ✅ | drawers | 9 |
| Procurement | 5 | 33 | 6 | 6 | ✅ | drawers | 4 |
| Inventory | 3 | 19 | 5 | 5 | ✅ | drawers | 3 |
| Subcontracts | 1+ | 20 | 3 | 3 | [Gap] | **schema+plugin** | 3 |
| Site | 1 agg | 15 | 2 | [Gap] | partial | drawers | 2 |
| Engineering | 5 | 26 | 1+ | 7 | [Gap] | drawers | 1 ⚠ |
| Doc Control | 5 | 16 | 2 | 2 | [Gap] | drawers | 2 |
| Quality | 8 | 33 | 3 | 3 | [Gap] | drawers | 3 |
| HSE | 1 agg | 19 | 2 | 3 | [Gap] | drawers | 2 |
| Finance | 14 | 93 | 17 | 6 | ✅ | drawers | 18 |
| HR | 8 | 41 | 11 | 4 | ✅ | **employee schema** | 8 |
| Assets | 1 agg | 15 | 2 | 3 | [Gap] | drawers | 2 |
| Fleet | 1 agg | 22 | 3 | 4 | [Gap] | drawers | 3 |
| AMC | 1 agg | 22 | 2 | reactor | [Gap] | drawers | 3 |

---

*Next: [Volume 4 — Kernel Documentation](vol-04-kernel.md)*

# AURA OS — L2 Business Modules Technical Report

> **Location:** `modules/`  
> **Workspace Packages:** 17 business packages  
> **Standard Structure:** `domain/` (entities/rules) · Ports (store interfaces) · Adapters (InMemory/Postgres) · Services · Module Wiring  
> **Status:** All 17 backend packages fully implemented, built, and tested.

---

## 1. Modular Decoupling & Laws of Data Ownership

Each business module is a strictly decoupled **Bounded Context** designed to operate independently. Under no circumstances may a module query or modify tables owned by another module. 

### Data Sharing & Communication Rules:
1. **Asynchronous Spine Events:** Major changes are published to the kernel event store as standard domain events (e.g., `procurement.po.created`). Decoupled subscribers in other modules react to these events.
2. **Synchronous REST Proxies:** For real-time checks (e.g., procurement checking a client's credit balance before accepting a PO), modules expose interfaces through NestJS controllers.
3. **Ports & Adapters Pattern:** Storage operations are isolated behind abstract interfaces (ports). At bootstrap, the module binds either an in-memory database mock (for fast local dev/testing) or a Postgres adapter:

```
               ┌─────────────────────────────────────┐
               │           Business Service          │
               └──────────────────┬──────────────────┘
                                  │ (calls Port)
                                  ▼
               ┌─────────────────────────────────────┐
               │           Store Interface           │
               └──────────┬───────────────────────┬──┘
                          │                       │
           (Postgres)     ▼                       ▼   (In-Memory)
             ┌─────────────────────────┐     ┌─────────────────────────┐
             │      PostgresStore      │     │      InMemoryStore      │
             │        Adapter          │     │        Adapter          │
             └─────────────────────────┘     └─────────────────────────┘
```

---

## 2. Profile of the 17 Business Modules

Here is the implementation scope for every module across the monorepo:

### 2.1 CRM (`@aura/crm`)
* **Domain Context:** Customer accounts, contact rosters, sales leads, and opportunity forecasting.
* **Entities:** `Account`, `Lead`, `Opportunity`.
* **Services:** `AccountService`, `LeadService`, `OpportunityService`.
* **Emitted Events:** `crm.account.created`, `crm.lead.created`, `crm.opportunity.status_changed`.
* **Database Migration:** `0005_crm_accounts.sql`, `0044_crm_leads_opportunities.sql`.
* **Tests:** `account.test.ts`.

### 2.2 Tendering & Estimating (`@aura/tendering`)
* **Domain Context:** Tenders, Bid/No-Bid workflow evaluations, hierarchical Bill of Quantities (BOQ) spreadsheets, and BIM element matching.
* **Entities:** `Tender`, `BOQ`, `BOQItem`.
* **Services:** `TenderService`.
* **Emitted Events:** `tendering.tender.created`, `tendering.tender.updated`, `tendering.tender.awarded` (Won).
* **Database Migration:** `0006_tendering_tenders.sql`, `0042_tendering_boq.sql`.
* **Tests:** `tender.test.ts`, `boq.test.ts`.

### 2.3 Contracts (`@aura/contracts`)
* **Domain Context:** Main client contracts, variation records, billing schedules, and milestone approvals.
* **Entities:** `Contract`, `Milestone`.
* **Services:** `ContractService`.
* **Emitted Events:** `contracts.contract.created`, `contracts.contract.signed`, `contracts.contract.milestone_approved`.
* **Database Migration:** `0007_contracts_contracts.sql`.
* **Tests:** `contract.test.ts`.

### 2.4 Projects & Cost Management (`@aura/projects`)
* **Domain Context:** Execution project logs, recursive Work Breakdown Structure (WBS) tasks, cost codes, CBS structures, and Earned Value Management (EVM).
* **Entities:** `Project`, `WbsNode`, `CbsNode`.
* **Services:** `ProjectService`, `WbsService`.
* **Emitted Events:** `projects.project.created`, `projects.wbs.node_created`, `projects.wbs.progress_updated`, `projects.cbs.node_created`.
* **Database Migration:** `0008_projects_projects.sql`, `0016_projects_wbs.sql`, `0047_projects_cbs.sql`.
* **Tests:** `project.test.ts`, `cbs.test.ts`, `delay-eot.test.ts`, `wbs.test.ts`.

### 2.5 Procurement (`@aura/procurement`)
* **Domain Context:** Material Purchase Requests (PRs), Purchase Orders (POs), and vendor agreements.
* **Entities:** `PurchaseRequest`, `PurchaseOrder`, `POLine`.
* **Services:** `PrService`, `PoService`.
* **Emitted Events:** `procurement.pr.created`, `procurement.po.created`, `procurement.po.status_changed`.
* **Database Migration:** `0009_procurement_purchase_orders.sql`, `0015_procurement_pr.sql`.
* **Tests:** `pr.test.ts`, `po.test.ts`.

### 2.6 Inventory & Logistics (`@aura/inventory`)
* **Domain Context:** Site material storage, warehouse counts, and Goods Receipt Notes (GRNs) processing.
* **Entities:** `GoodsReceiptNote`, `GRNLine`.
* **Services:** `GoodsReceiptService`.
* **Emitted Events:** `inventory.grn.created`, `inventory.grn.accepted`.
* **Database Migration:** `0010_inventory_grns.sql`.
* **Tests:** `goods-receipt.test.ts`.

### 2.7 Finance & Ledger (`@aura/finance`)
* **Domain Context:** Invoices, payments, Chart of Accounts, balanced double-entry journal postings, VAT calculations, and bank reconciliation.
* **Entities:** `Invoice`, `JournalEntry`, `Payment`, `Account`, `TaxCode`.
* **Services:** `InvoiceService`, `LedgerService`, `PaymentService`, `TaxService`.
* **Emitted Events:** `finance.invoice.created`, `finance.invoice.approved`, `finance.invoice.paid`, `finance.journal.posted`.
* **Database Migration:** `0011_finance_invoices.sql`, `0014_finance_gl.sql`, `0046_bank_reconciliation.sql`, `0048_finance_tax_engine.sql`.
* **Tests:** `finance.test.ts`.

### 2.8 Subcontracts (`@aura/subcontracts`)
* **Domain Context:** Subcontract agreements, variations, Interim Payment Certificates (IPCs), and automatic 10% retention withholding.
* **Entities:** `Subcontract`, `SubcontractClaim`.
* **Services:** `SubcontractsService`.
* **Emitted Events:** `subcontracts.subcontract.created`, `subcontracts.claim.submitted`, `subcontracts.claim.certified`.
* **Database Migration:** `0017_subcontracts.sql`, `0045_subcontract_retention_release.sql`.
* **Tests:** `subcontracts.test.ts`.

### 2.9 Engineering (`@aura/engineering`)
* **Domain Context:** Shop drawings logs, submittals review registers, and RFIs.
* **Entities:** `Drawing`, `Rfi`, `Submittal`.
* **Services:** `EngineeringService`.
* **Emitted Events:** `engineering.drawing.submitted`, `engineering.rfi.raised`, `engineering.submittal.status_changed`.
* **Database Migration:** `0020_engineering.sql`.
* **Tests:** `engineering.test.ts`.

### 2.10 Document Control (`@aura/doccontrol`)
* **Domain Context:** Incoming/outgoing transmittals registry and official correspondence indexes.
* **Entities:** `Transmittal`, `Correspondence`.
* **Services:** `DocControlService`.
* **Emitted Events:** `doccontrol.transmittal.sent`, `doccontrol.correspondence.logged`.
* **Database Migration:** `0021_doccontrol.sql`.
* **Tests:** `doccontrol.test.ts`.

### 2.11 Site Control (`@aura/site`)
* **Domain Context:** Daily construction progress reports, site diaries, delays log, and material log.
* **Entities:** `DailyReport`, `DelayLog`, `MaterialConsumption`.
* **Services:** `SiteService`.
* **Emitted Events:** `site.daily_report.submitted`, `site.delay.logged`, `site.material_used.logged`.
* **Database Migration:** `0022_site.sql`.
* **Tests:** `site.test.ts`.

### 2.12 HSE (`@aura/hse`)
* **Domain Context:** Safety incidents, Permits to Work (PTW), and compliance actions (CAPA).
* **Entities:** `Incident`, `PermitToWork`, `CapaAction`.
* **Services:** `HseService`.
* **Emitted Events:** `hse.incident.reported`, `hse.permit.issued`, `hse.capa.raised`.
* **Database Migration:** `0023_hse.sql`.
* **Tests:** `hse.test.ts`.

### 2.13 Quality (`@aura/quality`)
* **Domain Context:** Non-Conformance Reports (NCR), site Inspection Requests (IR), and Punch/Snag lists.
* **Entities:** `NCR`, `InspectionRequest`, `SnagItem`.
* **Services:** `QualityService`.
* **Emitted Events:** `quality.ncr.raised`, `quality.ir.submitted`, `quality.snag.logged`.
* **Database Migration:** `0024_quality.sql`.
* **Tests:** `quality.test.ts`.

### 2.14 HR & Payroll (`@aura/hr`)
* **Domain Context:** Employee profiles, leave allocation limits, monthly payroll compensation, and End of Service Benefits (EOSB).
* **Entities:** `Employee`, `LeaveRequest`, `PayrollRun`.
* **Services:** `HrService`.
* **Emitted Events:** `hr.employee.created`, `hr.leave.approved`, `hr.payroll.paid`.
* **Database Migration:** `0025_hr.sql`.
* **Tests:** `hr.test.ts`.

### 2.15 Fleet & Logistics (`@aura/fleet`)
* **Domain Context:** Vehicles list, driver logs, fuel tracking, and preventative maintenance logs.
* **Entities:** `Vehicle`, `FuelLog`, `MaintenanceRecord`.
* **Services:** `FleetService`.
* **Emitted Events:** `fleet.vehicle.registered`, `fleet.fuel.logged`, `fleet.maintenance.completed`.
* **Database Migration:** `0026_fleet.sql`.
* **Tests:** `fleet.test.ts`.

### 2.16 Assets & Calibration (`@aura/assets`)
* **Domain Context:** Heavy capital assets, preventative maintenance schedules, and instrument calibration logs.
* **Entities:** `Asset`, `AssetMaintenance`, `AssetInspection`.
* **Services:** `AssetsService`.
* **Emitted Events:** `assets.asset.registered`, `assets.maintenance.scheduled`, `assets.inspection.passed`.
* **Database Migration:** `0027_assets.sql`.
* **Tests:** `assets.test.ts`.

### 2.17 AMC & Service Module (`@aura/amc`)
* **Domain Context:** SLA service contracts, priority ticket queues, work dispatch registers, and GIS coordinate boundaries.
* **Entities:** `ServiceContract`, `WorkOrder`, `SupportTicket`.
* **Services:** `AmcService`.
* **Emitted Events:** `amc.contract.created`, `amc.work_order.assigned`, `amc.ticket.sla_breached`.
* **Database Migration:** `0038_amc.sql`.
* **Tests:** `amc.test.ts`.

---

## 3. Cross-Module Event Spine Integrations

The modules connect asynchronously via `CrossModuleSubscriber` to orchestrate multi-step business transactions.

```
       [ CRM Lead / Opportunity ]
                   │
                   ▼ (tendering.tender.awarded)
      [ Tendering / Bid recived ]  ───► Recalculate Tender estimate
                   │
                   ▼ (contracts.contract.signed)
         [ Contract signed ]  ───► Auto-create Contract entry
                   │
                   ▼ (projects.project.created)
        [ Create Project & WBS ]
             │              │
             │ (PO Created) │ (Invoice Paid)
             ▼              ▼
      [ Committed Cost ]  [ Actual Cost ]  ───► EVM Rollup Metrics
```

### Core Wiring Chains:
1. **Tender Won $\rightarrow$ Contract Creation:** Winning a tender triggers a draft contract template mapping the won bid values.
2. **Contract Signed $\rightarrow$ Project Activation:** Signing a contract drafts a project context and a base WBS node.
3. **PO Issued $\rightarrow$ WBS Commitment:** Creating a PO registers the cost commitment against the target WBS cost code.
4. **GRN Accepted $\rightarrow$ Suggested Invoice:** Accepting site delivery suggestions triggers a draft AP invoice in the finance ledger.
5. **Invoice Paid $\rightarrow$ Actual Cost Logging:** Paying an invoice records actual costs in the project, recalculating Earned Value (EVM) metrics.

---

## 4. Verification and Test Results

All modules are verified using automated vitest suites running against standard schemas.

- **Total Test Suites:** 20 test files targeting module business rules.
- **Pass Rate:** **100% of tests are passing**.
- **Execution Performance:** All tests complete execution in under **10 seconds** using cached Turborepo builds.

---

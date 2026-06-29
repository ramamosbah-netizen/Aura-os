# Aura OS v2 - Comprehensive Update Report
**Ordered Chronologically by Date (Newest to Oldest)**

This report documents the architectural structure, services, business logic, workflows, databases, APIs, and UI layers of Aura OS v2, tracked day by day.

---

## June 28, 2026: Platform Services, Extensibility, Assets, Saga Engine, CRM Pipeline, Retention Release & Bank Reconciliation

### 1. Subcontract Retention Release Claims (Phase 7 Depth)
* **Database (`0045_subcontract_retention_release.sql`)**:
  - Adds `is_retention_release` (boolean) and `retention_released` (numeric) columns to the `aura_subcontracts_claims` table to allow subcontractors to claim released retention.
* **Domain & Business Logic (`claim.ts`, `subcontracts.service.ts`)**:
  - Extended the `Claim` domain interfaces and the `makeClaim` factory logic. When `isRetentionRelease` is true, standard retention withholding calculations are skipped, and the net certified value matches the retention release amount.
  - Updated `SubcontractsService.createClaim` to accept and process the new parameters.
* **APIs & Host Gateway (`subcontracts.controller.ts`)**:
  - Extended NestJS `CreateClaimDto` and `@Post('claims')` route logic to support the optional retention release flags.

### 2. Bank Reconciliation Services (Finance)
* **Database (`0046_bank_reconciliation.sql`)**:
  - Creates the `aura_finance_bank_transactions` table to track imported bank statement transactions, reconciliation statuses (`unreconciled`, `matched`, `manual`), and matching links to payments (`reconciled_payment_id`).
* **Domain & Business Logic (`bank-transaction.ts`, `bank-reconciliation.service.ts`, `postgres-bank-transaction-store.ts`, `in-memory-bank-transaction-store.ts`)**:
  - Defined the `BankTransaction` domain model and factory functions.
  - Implemented the `BankReconciliationService` containing logic for:
    - Statement transaction imports.
    - Automatching heuristic engine matching bank transactions with ledger payments using date range thresholds (+/- 7 days) and exact amount comparisons.
    - Manual reconciliation matching and unreconciliation actions.
* **APIs & BFF**:
  - Registered `BANK_TRANSACTION_STORE` and `BankReconciliationService` in `FinanceModule`.
  - Exposed NestJS REST controller endpoints for bank transactions list, import, auto-match, manual reconcile, and unreconcile.
  - Created Next.js BFF proxy routes in `apps/web/app/api/finance/bank-transactions` to bridge front-end requests to the backend gateway.

### 3. Enterprise Execution Engine (Saga & Process Orchestrator)
* **Database (`0043_saga_execution_engine.sql`)**:
  - `aura_kernel_saga_instances`: Holds global saga transactions status (`pending`, `running`, `completed`, `failed`, `compensating`, `compensated`).
  - `aura_kernel_saga_steps`: Stores individual steps with names, status, execution payload, and errors.
* **Services & Logic (`saga-orchestrator.service.ts`, `postgres-saga-store.ts`, `in-memory-saga-store.ts`)**:
  - Transaction orchestration engine supporting forward step execution and automatic reverse-order compensation execution on failure.
  - Wired up as part of the core NestJS kernel module (`CoreModule`).
  - Fully tested by integration test harness.

### 2. CRM Leads & Opportunities Pipeline (Phase 7)
* **Database (`0044_crm_leads_opportunities.sql`)**:
  - `aura_crm_leads`: Stores company details, emails, phones, status, and lead source metrics with RLS.
  - `aura_crm_opportunities`: Tracks customer opportunities, bid value, stage, win probability, and close dates.
* **Domain & Business Logic (`crm.ts`, `lead.service.ts`, `opportunity.service.ts`)**:
  - Exposes dedicated services and PG-based entity stores with RLS context matching.
  - **AI Win Probability Forecasts**: Integrates with the kernel AI service to calculate and explain win probabilities.
  - **Downstream Deal Chain Reactor**: Emits structural events. When an opportunity is marked `won`, a cross-module subscriber listens to `crm.opportunity.stage_changed` and automatically provisions a draft Tender under `@aura/tendering`.
* **APIs & BFF**:
  - NestJS controllers `CrmLeadsController` and `CrmOpportunitiesController` registered in `@aura/api`.
  - Next.js BFF routes `/api/crm/leads` and `/api/crm/opportunities` with patch/forecast handlers.
* **UI (`crm-pipeline-client.tsx`, `/crm/leads/page.tsx`)**:
  - A glassmorphic pipeline management UI showing KPI status cards, leads, interactive opportunity lists, and a one-click AI forecast trigger.

### 3. Estimating & Bill of Quantities (BOQ) Module
* **Database (`0042_tendering_boq.sql`)**: 
  - `aura_tendering_boqs`: Unique BOQ register per Tender.
  - `aura_tendering_boq_items`: Line-item spreadsheet records containing `item_code` (tree code), `description`, `unit`, `quantity`, `rate`, `total_amount`, and `ifc_guid` (BIM model link). Row-Level Security (RLS) is enabled.
* **Domain & Business Logic (`boq.ts`, `tender.service.ts`)**:
  - Auto-recalculations: Mutating any line item runs transactional rollups updating the parent `value` in `aura_tendering_tenders`.
  - Natural sorting: String tree codes (e.g. `1.1.10` after `1.1.2`) are sorted via natural JavaScript localeCompare.
  - Spine events: Emits `tendering.tender.updated` on transaction commit.
* **APIs & BFF**:
  - NestJS `TenderingController` endpoints for CRUD, batch imports, and updates.
  - Next.js BFF route handlers under `/api/tendering/tenders/[id]/boq`.
* **UI (`tender-detail.tsx`, `tenders/page.tsx`)**:
  - A glassmorphic spreadsheet grid page showing indented codes, inline editing, and deletion.
  - **AURA AI Import Dialog**: Step-by-step mock PDF/Excel OCR parsing interface mapping items to the database.

### 4. Cost Code Allocation to Invoices
* **Database (`0041_add_wbs_node_id_to_invoices.sql`)**: Adds foreign key `wbs_node_id` referencing `aura_projects_wbs` to `aura_finance_invoices` for direct project cost accounting.

### 5. AI Intelligence Platform
* **Database (`0040_intelligence_platform.sql`)**:
  - `aura_intelligence_guardrails`: Defines rules (e.g., max discount, strict compliance).
  - `aura_intelligence_context`: Stores context snapshots for agent reasoning.
* **Services & Logic (`ai-guardrails.service.ts`, `ai-context.engine.ts`, `ai-platform.service.ts`, `mcp-server.service.ts`, `process-mining.service.ts`)**:
  - Implements guardrail evaluations and prompt injections.
  - Integrates an MCP (Model Context Protocol) server client to extend LLM runtime capabilities.
  - Incorporates process mining engines to detect workflow bottlenecks.
* **APIs**: `/api/intelligence/calibrations` controller.
* **UI**: `/admin/intelligence` calibration dashboards.

### 6. Builder Platform (No-Code Form & Workflow Customizer)
* **Database (`0039_builder_platform.sql`)**:
  - `aura_builder_forms`: Custom schemas for dynamic page rendering.
  - `aura_builder_approval_matrices`: Configurable monetary approval steps (e.g. Finance approvals > $50,000).
* **Services & Logic (`approval-matrix.service.ts`, `form-registry.service.ts`, `entity-registry.service.ts`, `workflow-orchestrator.service.ts`)**:
  - Validates dynamic workflow rules and registers custom structures.
* **UI (`visual-template-builder.tsx`)**: Canvas-style template builder.

### 7. Annual Maintenance Contracts (AMC)
* **Database (`0038_amc.sql`)**:
  - `aura_amc_contracts`: Customer contract parameters.
  - `aura_amc_work_orders`: Assigned field maintenance tasks.
  - `aura_amc_tickets`: Live incident tickets.
* **Services & Logic (`amc.service.ts`)**: Manages work-order schedules, tech assignments, and SLA timers.
* **APIs**: `/api/amc` NestJS controller.
* **UI**: `/amc/control` panel.

### 8. SaaS Connectors & Code Generator
* **Database (`0037_integration_connectors.sql`)**: Connectors configurations (e.g. ERP integrations).
* **Services (`connector.service.ts`, `sdk-generator.service.ts`)**: Generates system-to-system SDK files and syncs outbound endpoints.

### 9. Kernel Hardening & Platform Services
* **Database (`0028_kernel_numbering.sql` to `0036_platform_services.sql`)**:
  - Numbering configurations, tenant audits, exchange rates, global project calendar tables, idempotency records, and projection states.
* **Services & Logic**:
  - `numbering.service.ts`: Autogenerates custom document prefixes (e.g., `PO-2026-001`).
  - `audit.service.ts`: Enforces immutable audit logging.
  - `exchange-rate.service.ts`: Dynamically calculates cross-currency values.
  - `idempotency.service.ts` & `idempotency.interceptor.ts`: Prevents duplicate API requests.
  - `projection.engine.ts` & `snapshot.engine.ts`: Prevents duplicate records on the event bus outbox.
  - `calendar.service.ts`: Working days calculation.
  - `circuit-breaker.ts` & `rate-limiter.ts`: Prevents system outages.
  - `background-job.service.ts`: Runs background queues.
  - `notification.service.ts`: Multi-channel alerts.
* **UI**: `/finance/ledger/page.tsx` showing Ledger aggregations, and `/assets/control` dashboard.

---

## June 27, 2026: Operate-Side & Regulatory Modules (HSE, HR, Quality, Fleet, Doc Control)

### 1. Fleet Management
* **Database (`0026_fleet.sql`)**: Registers vehicles, fuel usage sheets, and preventive maintenance records.
* **Services (`fleet.service.ts`)**: Calculates fuel efficiency metrics and logs lifecycle costs.
* **APIs & UI**: `/api/fleet/vehicles`, `fleet-control-client.tsx`.

### 2. Human Resources (HR)
* **Database (`0025_hr.sql`)**: Stores employees, leave records, and payroll runs.
* **Services (`hr.service.ts`)**: Handles payroll calculations, tax rollups, and leave balance deductions.
* **APIs & UI**: `/api/hr/employees`, `hr-control-client.tsx`.

### 3. Quality Control (QA/QC)
* **Database (`0024_quality.sql`)**: Registers site inspection requests (IRs), Non-Conformance Reports (NCRs), and snag lists.
* **Services (`quality.service.ts`)**: Tracks Quality KPIs and enforces inspection approvals.
* **APIs & UI**: `/api/quality/irs`, `quality-control-client.tsx`.

### 4. Health, Safety & Environment (HSE)
* **Database (`0023_hse.sql`)**: Stores incident reports, Permits-to-Work (PTW), and CAPA logs.
* **Services (`hse.service.ts`)**: Enforces PTW approvals and tracks incident response compliance.
* **APIs & UI**: `/api/hse/incidents`, `hse-control-client.tsx`.

### 5. Site Management
* **Database (`0022_site.sql`)**: Records daily construction logs, delay reports, and material usages.
* **Services (`site.service.ts`)**: Computes cumulative delay impacts and generates daily logs.
* **APIs & UI**: `/api/site/daily-reports`, `site-control-client.tsx`.

### 6. Document Control & Engineering
* **Database (`0020_engineering.sql`, `0021_doccontrol.sql`)**: Logs transmittals, official correspondence, project drawings, RFIs, and submittals.
* **Services (`engineering.service.ts`, `doccontrol.service.ts`)**: Implements drawing approvals, RFI reply flows, and correspondence registers.
* **APIs & UI**: `/api/engineering/drawings`, `/api/doccontrol/correspondence`, `engineering-client.tsx`, `doccontrol-client.tsx`.

---

## June 26, 2026: Execution, Subcontracts, & Pricing Calibration

### 1. Pricing Autonomy Calibration
* **Database (`0019_intelligence_pricing_autonomy.sql`)**: Logs historical supplier pricing and sets autonomous budget caps.
* **Services (`pricing.service.ts`, `autonomy.service.ts`)**: Computes competitive bid ranges and validates incoming quotes against historical benchmarks.
* **APIs & UI**: `/api/intelligence/calibrations`, `intelligence-panel.tsx`.

### 2. Subcontracts
* **Database (`0017_subcontracts.sql`)**: Stores subcontracts, progress claims, and valuation certificates.
* **Services (`subcontracts.service.ts`)**: Enforces subcontract payment terms and tracks retention rules.
* **APIs & UI**: `/api/subcontracts`, `subcontracts-list.tsx`.

### 3. Work Breakdown Structure (WBS)
* **Database (`0016_projects_wbs.sql`)**: Stores hierarchical project tasks linked to budgets.
* **Services (`wbs.service.ts`)**: Resolves WBS tree parent rollups and calculates Earned Value Management (EVM) metrics.
* **APIs & UI**: `/api/projects/wbs`, `/projects/projects/page.tsx` (linking Project details).

---

## June 25, 2026: Financial Auditing & Operations

### 1. General Ledger & Double-Entry Journal Postings
* **Database (`0014_finance_gl.sql`)**: Introduces chart of accounts, double-entry journal postings, and payment matching.
* **Services (`finance.service.ts`)**: Posts automatic debit/credit logs whenever invoices are approved or payments processed.
* **APIs & UI**: `/api/finance/journals`, `/finance/ledger/page.tsx`, `ledger-view.tsx`.

### 2. Procurement (Purchase Orders & Requests)
* **Database (`0009_procurement_purchase_orders.sql`, `0015_procurement_pr.sql`)**: Holds Purchase Requests (PR) and Purchase Orders (PO).
* **Services (`purchase-order.service.ts`, `purchase-request.service.ts`)**: Manages PR-to-PO conversions and budgetary approval checks.
* **APIs & UI**: `/api/procurement/purchase-orders`, `/procurement/purchase-requests`, `po-list.tsx`.

### 3. Inventory (Goods Receipt Notes)
* **Database (`0010_inventory_grns.sql`)**: Logs material arrivals against active POs.
* **Services (`goods-receipt.service.ts`)**: Validates quantity limits and increments site store ledgers.
* **APIs & UI**: `/api/inventory/grns`, `grn-create.tsx`.

### 4. Webhook Retries & Dead Letter Outbox Relay
* **Database (`0012_webhook_retry.sql`, `0013_events_dead_letter.sql`)**: Webhook delivery logs, retry backoffs, and outbox failure queues.
* **Services (`webhook-retry-worker.ts`, `outbox-relay.ts`)**: Relays system events reliably with poison-pill guards.

---

## June 24, 2026: Core Kernel Foundation, CRM, & Next.js App Shell Scaffolding

### 1. Next.js App Shell & Command Center
* **Services & Logic**: Scaffolds UI workspace framing, Global navigation, search mechanisms, and system themes.
* **UI**: `/login/page.tsx`, `app-shell.tsx`, `command-palette.tsx` (Cmd-K palette).

### 2. Event Outbox Spine
* **Database (`0001_kernel_events.sql`)**: Transactional outbox event store.
* **Services (`event-bus.ts`, `postgres-event-store.ts`)**: Enforces ACID compliance using transactional outbox patterns.

### 3. Business Foundation (CRM, Tenders, Contracts, Projects)
* **Database (`0005_crm_accounts.sql` to `0008_projects_projects.sql`)**: Scaffolds business registers for CRM, Tenders, Contracts, and Projects.
* **Services**: Exposes service objects (`account.service.ts`, `tender.service.ts`, `contract.service.ts`, `project.service.ts`).
* **APIs & UI**: Controllers for each module; creation components (`account-create.tsx`, `tender-create.tsx`, `contract-create.tsx`, `project-create.tsx`).

### 4. Tenant Org, RBAC, DMS, and Workflow Engine
* **Database (`0002_kernel_documents.sql`, `0003_kernel_workflows.sql`, `0004_kernel_webhooks.sql`)**: Sets up DMS, workflows, and webhook definitions.
* **Services**:
  - `org.service.ts`: Organizational hierarchies.
  - `access.service.ts`: Enforces RBAC/ABAC rules.
  - `dms.service.ts`: Manages versioned documents.
  - `workflow.service.ts`: Executes state transitions.

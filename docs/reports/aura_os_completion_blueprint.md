# AURA OS V8: Enterprise Architecture Standard

> **Status:** Final Approved Architectural Constitution & Reference Standard  
> **Author:** AURA Core Architecture Team  
> **Version:** 8.0 (Global Enterprise Tier-1 Standard)  
> **Date:** June 28, 2026

---

```
                        AURA ENTERPRISE ARCHITECTURE FRAMEWORK (V8)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    EXPERIENCE LAYER                                    │
│             Web Shell • Mobile PWA • Customer/Supplier Portals • Command Palette       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                     ECOSYSTEM LAYER                                    │
│                 OpenAPI Catalog • TypeScript SDK Generator • MCP Server Gateway        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                     BUSINESS LAYER                                     │
│     Core Engines (Posting, Allocation, Risk) • 16 Decoupled L2 Modules (CRM, Finance)  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                ENTERPRISE PLATFORMS LAYER                              │
│   Data Platform (MDM, Graph) • Intelligence Fabric (AI) • Automation (BPMN, DMN)       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                    FOUNDATION LAYER                                    │
│          Core Runtime (Plugin, Sagas) • Kernel (Auth, Audit) • CDM (Party, Location)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part I: Enterprise Constitution

The Platform Constitution defines the non-negotiable architectural laws of AURA OS. All services, modifications, and integrations must comply with these laws. No exceptions are permitted.

1. **Decoupled Database Contexts:** Under no circumstances may a module query or modify a database table belonging to another module. Inter-module data exchange is strictly asynchronous via the event bus or synchronous through public contract APIs.
2. **Command Pipeline Integrity:** Write operations must run through the kernel command pipeline, executing validation, RBAC/ABAC authorization, idempotency verification, and transactional outbox writing in a single database transaction.
3. **Read Model Segregation:** Analytical dashboards, global searches, and AI context builders must read exclusively from read-model projections. Transactional tables must not be locked by analytical operations.
4. **Interface Decoupling:** Pluggable infrastructure drivers (object storage, search indexes, vector databases, notification gateways) must hide behind core interfaces. Vendor lock-in within business modules is forbidden.
5. **Immutable Financial Ledger:** Once written, ledger entries cannot be updated or deleted. All adjustments must use offsetting reversal journal lines. A trigger must validate ledger balances before committing a journal.
6. **Strict API Backward Compatibility:** Public API schemas, event contracts, and data structures are versioned. Breaking changes require incrementing the major version of the contract.
7. **SaaS Multi-Tenant Isolation:** Every query, database access, and cache lookup must carry a verified tenant identifier, isolated via row-level security (RLS) policies.

---

## Part II: Enterprise Meta Model

AURA OS organizes all application metadata, schemas, and extensions into a unified, version-controlled meta-model.

```
                      AURA ENTERPRISE META-MODEL REGISTRY
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                           Metadata Registry                             │
 ├───────────────────┬────────────────────────┬────────────────────────────┤
 │  Entity Registry  │     Form Registry      │     Workflow Registry      │
 │  Schema definition│  JSON Schema fields    │    BPMN Node Graphs        │
 └───────────────────┴────────────────────────┴────────────────────────────┘
```

- **Entity Schema Definition:** Defines entity keys, attributes, validation constraints, index settings, and search capabilities.
- **Form Layout Definition:** Controls dynamic user interface generation using JSON Schema definitions.
- **Workflow State Graphs:** Maps process states, gateways, conditional transitions, and user actions using BPMN formats.
- **Approval Matrices:** Defines threshold rules, required approvals, and escalation targets.

---

## Part III: Architecture Principles

- **Zero-Trust Security:** Security tokens, scope verification, and tenant variables must be evaluated at every layer.
- **Event-Driven Audit Trails:** Business mutations must write a historical log entry and a transaction outbox record inside the primary database transaction.
- **Resilience & Fault Tolerance:** Network calls and third-party integrations must use circuit breakers, bulkheads, rate limiters, and retry queues.
- **Stateless Application Services:** Server nodes must not maintain local state. State must be preserved in the event store, projections, or caching layer.
- **Performance Budgeting:** Database query execution must not exceed 100ms. Page load times must remain below 1.5 seconds.

---

## Part IV: Canonical Data Model (CDM)

AURA OS uses a unified Canonical Data Model (CDM) for shared master records, preventing duplicate entries and standardizing cross-module integration.

### 1. Party (CDM)
Represents individuals or organizations interacting with AURA OS.
- **Location:** `shared/src/domain/cdm/party.ts`
```typescript
export interface Party {
  id: string;
  tenantId: string;
  type: 'customer' | 'vendor' | 'employee' | 'subcontractor' | 'consultant';
  name: string;
  taxIdentifier?: string; // VAT registration
  address: Address;
  contacts: Contact[];
}
```

### 2. Document (CDM)
The envelope for file attachments and generated system assets.
- **Location:** `shared/src/domain/cdm/document.ts`
```typescript
export interface Document {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  hash: string; // File integrity verification
  tags: string[];
  version: number;
  isArchived: boolean;
}
```

### 3. Project (CDM)
The physical context of execution.
- **Location:** `shared/src/domain/cdm/project.ts`
```typescript
export interface Project {
  id: string;
  tenantId: string;
  code: string; // Auto-generated code (e.g. PRJ-2026-001)
  title: string;
  clientPartyId: string; // Links to Party CDM
  location: Location;
  period: Period;
  status: 'planned' | 'active' | 'suspended' | 'completed' | 'archived';
}
```

### 4. Account & Cost Center (CDM)
Structures for financial ledgers.
- **Location:** `shared/src/domain/cdm/finance.ts`
```typescript
export interface Account {
  id: string;
  code: string; // COA code
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  projectId?: string; // Links to Project CDM
  departmentId?: string;
}
```

### 5. Location (CDM)
Coordinates and geographic metadata.
- **Location:** `shared/src/domain/cdm/location.ts`
```typescript
export interface Location {
  id: string;
  latitude: number;
  longitude: number;
  addressLine: string;
  emirate?: 'Abu Dhabi' | 'Dubai' | 'Sharjah' | 'Ajman' | 'Umm Al Quwain' | 'Ras Al Khaimah' | 'Fujairah';
  country: string;
  geofenceRadiusMeters?: number;
}
```

---

## Part V: Business Capability Model

```
                          AURA OS BUSINESS CAPABILITY MODEL
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                            Capability Catalog                           │
 ├───────────────────┬────────────────────────┬────────────────────────────┤
 │  Domain Catalog   │    Process Catalog     │        KPI Registry        │
 │  Aggregates/Events│  BPMN Workflow Specs   │  Formula calculations      │
 └───────────────────┴────────────────────────┴────────────────────────────┘
```

- **Capability Catalog:** Maps system features (e.g., invoice creation, procurement sourcing) to service interfaces.
- **Domain Catalog:** Registers aggregates, entities, commands, and domain events.
- **Process Catalog:** Contains BPMN workflow configurations, approval policies, and state transitions.
- **KPI Registry:** Manages system-wide metric calculations (e.g., actual cost of work performed, margin deviations).
- **Policy Registry:** Houses authorization scopes, data retention settings, and validation criteria.
- **Business Glossary:** Defines standardized terminology (e.g., Purchase Order, Goods Receipt Note).

---

## Part VI: Enterprise Platforms

AURA OS consolidates operations under four primary enterprise platform engines.

### 1. Data Platform
- **Master Data Management (MDM):** Handles duplicate records, phonetic matching, and survivorship rules for core entities.
- **Graph Database Engine:** Manages relationships between entities (Asset Graph, Knowledge Graph).
- **Semantic Layer:** Abstract definition engine for KPIs, separating calculation rules from UI dashboards.
- **CDC Streaming:** Captures database transactions asynchronously from Postgres WAL, feeding them to Kafka and analytical databases.
- **Search, Cache, and Spatial Services:** Manages search indexing, projection caching, GIS tracking, and BIM integration.

### 2. Automation Platform
- **BPMN Orchestrator:** Controls long-running processes, sagas, gateways, and escalations.
- **DMN Rules Engine:** Version-controlled decision tables and business logic rules.
- **Constraint Solver:** Handles scheduling optimization (Ramadan hours, shifts, vehicle routing).
- **Document Intelligence:** Extracts metadata from PDFs and CAD documents.

### 3. Intelligence Fabric
- **AI Context Engine:** Assembles digital twin snapshots to construct LLM context windows.
- **Agent Registry & ReAct Loop:** Runs prompt templates and tool mappings through agent loops.
- **Process Mining:** Identifies process variants and system bottlenecks.
- **AI Safety Guardrails:** Enforces keyword lists, token limits, topic checks, and PII masking.

### 4. Operations Platform
- **SSO Identity Provider:** Provisioning workflows (Joiner/Mover/Leaver) and multi-factor login checks.
- **SRE Gateways:** Implements rate limits, bulkhead isolation, and circuit breakers.
- **Telemetry Aggregator:** Central collection point for logs, performance metrics, and transaction tracing.
- **FinOpsCost Management:** Monitors AI API and compute resource allocation per tenant.

---

## Part VII: Core Runtime

The base layer executing application logic.

- **Plugin Runtime:** Dynamic loading of custom controllers, menu items, and modules.
- **Workflow Runtime:** Execution system for BPMN graphs, handling state persistence and retries.
- **Rule Runtime:** DMN standard evaluator for logical decision trees.
- **AI Runtime:** LLM integration provider with model failover and pricing routing.
- **Module Registry:** Manages cross-module dependencies and handles registration.
- **Scheduler Runtime:** Runs cron schedules, queue processing, and background jobs.

---

## Part VIII: Business Engines

Decoupled services for key calculation logic.

- **Financial Ledger Engine:** Validates double-entry balance sheets, performs currency conversion, and manages periods.
- **Cost Engine:** Aggregates costs (budgeted, committed, actual) across cost centers.
- **Risk Engine:** Evaluates project risk impact using Monte Carlo simulation algorithms.
- **Calculation & Formula Engine:** Calculates tax rates, retention amounts, and depreciation.
- **Numbering Engine:** Generates unique, non-overlapping transaction sequence codes.
- **Identity Resolution Engine:** Phonetic matching algorithms to merge duplicate supplier and client profiles.

---

## Part IX: Business Modules

The application consists of sixteen L2 business modules, completely isolated from one another:

```
                            THE 16 BUSINESS MODULES
 ┌───────────────────┬────────────────────────┬────────────────────────────┐
 │  CRM & Sales      │  Tendering             │  Estimating (BOQ)          │
 ├───────────────────┼────────────────────────┼────────────────────────────┤
 │  Contracts        │  Projects (WBS)        │  Procurement               │
 ├───────────────────┼────────────────────────┼────────────────────────────┤
 │  Subcontracts     │  Inventory             │  Finance & GL              │
 ├───────────────────┼────────────────────────┼────────────────────────────┤
 │  Doc Control (DMS)│  Engineering           │  Site Control              │
 ├───────────────────┼────────────────────────┼────────────────────────────┤
 │  HSE              │  Quality (QA/QC)       │  HR & Payroll              │
 ├───────────────────┼────────────────────────┼────────────────────────────┤
 │  Fleet & Logistics│  Assets & Equipment    │  Asset Mgt & Contracts(AMC)│
 └───────────────────┴────────────────────────┴────────────────────────────┘
```

1. **CRM & Sales:** Lead conversion, pipeline metrics, and client engagement history.
2. **Tendering:** Bid submissions, tender updates, and award records.
3. **Estimating & BOQ:** Cost estimation files, BIM element mappings, and base quantities.
4. **Contracts:** Service contract parameters, billing cycles, and variation orders.
5. **Projects & WBS:** Dynamic task scheduling, task parent-child relationships, and progress tracking.
6. **Procurement:** Purchase requisitions, purchase orders, and supplier credit limit verification.
7. **Subcontracts:** Subcontractor scope definitions, certification records, and payment retention.
8. **Inventory:** Item catalogs, warehouse movements, and goods receipt processing.
9. **Finance & General Ledger:** Ledger journal lines, cost centers, tax records, and asset depreciation.
10. **Document Control & DMS:** File metadata index, file revision histories, and access tracking.
11. **Engineering:** Drawing submittals, RFI records, and design revision states.
12. **Site Control:** Digital daily diaries, weather logs, and site headcount checks.
13. **HSE:** Incident reports, safety inspections, and safety audit logs.
14. **Quality & QA/QC:** Quality inspection requests, non-conformance records, and testing logs.
15. **HR & Payroll:** Employee records, monthly payroll calculations, and leave allocations.
16. **Fleet & Logistics:** Vehicle registration records, tracking logs, and maintenance events.
17. **Asset Management & Contracts (AMC):** Service contracts, SLAs, GIS dispatch boards, and ticket deadlines.

---

## Part X: Experience Platform

Unified interfaces for internal and external actors.

- **Enterprise Web Shell:** React/Next.js dashboard with workspace components.
- **Field Mobile PWA:** Offline synchronization capability, storing updates locally and resolving conflicts on reconnect.
- **Portals (Customer & Supplier):** Secure external endpoints for invoice submission, bid tracking, and support ticket management.
- **Universal Inbox:** Aggregated inbox displaying required approvals, system notifications, and task assignments.
- **Universal Command Palette:** Search interface for commands, navigation, and global entity retrieval.

---

## Part XI: Enterprise Intelligence Fabric

Integrates predictive analysis and AI capabilities into system operations.

```
                          ENTERPRISE INTELLIGENCE FABRIC
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                           Context Builder Engine                        │
 ├───────────────────┬────────────────────────┬────────────────────────────┤
 │  Process Mining   │    Predictive Model    │       Safety Filters       │
 │  Bottleneck checks│ Cashflow forecasting   │    PII masking/Keywords    │
 └───────────────────┴────────────────────────┴────────────────────────────┘
```

- **AI Context Engine:** Assembles digital twin snapshots to build LLM context windows.
- **Process Mining:** Runs trace analytics on execution logs to locate system bottlenecks.
- **Predictive Engine:** Linear trend and moving average forecasting for cashflow planning.
- **Safety Filters:** Validates prompt sizes, masks PII, and filters forbidden keywords.
- **Agent Registry:** Registers specialized agents (Estimator, Auditor, Scheduler) with dedicated tools.

---

## Part XII: Developer Platform

Central hub for platform engineers, architects, and third-party developers.

- **Architecture Repository:** Contains design documents and architectural reference drawings.
- **API Explorer:** Live Swagger and OpenAPI playground, detailing core endpoints.
- **Event Catalog:** Registry of command structures, query parameters, and system events.
- **SDK Documentation:** Automatically generated TypeScript and client SDK libraries.
- **Runbooks & Guides:** Deployment procedures, database migration runbooks, and disaster recovery rules.

---

## Part XIII: Security & Governance

- **Postgres Row-Level Security (RLS):** Every database query isolates records by matching context parameters to current tenant variables:
  ```sql
  CREATE POLICY tenant_isolation_policy ON public.entity_table
    USING (tenant_id = public.current_tenant_id());
  ```
- **Strict Data Stewards Workflow:** Master data modification requires review before updating the active profile database.
- **Event Schema Registry:** Enforces JSON schema structures for emitted domain events, blocking invalid event schemas.
- **Encryption Standards:** Data in transit must use TLS 1.3. Data at rest must use AES-256 keys.

---

## Part XIV: Operational Excellence

- **System Observability:** Collection pipeline for metrics (Prometheus), traces (OpenTelemetry), and structured logs.
- **High Availability (DR):** Active-passive multi-region configuration with database replication.
- **Zero-Downtime Deployments:** Canary deployment pipelines and backward-compatible database migrations.
- **Compute Optimization (FinOps):** Limits AI API costs and resource consumption per tenant.

---

## Part XV: Implementation Standards

### 1. Coding Standards
- **TypeScript:** Enforces strict null checks, explicit return types for functions, and forbids the use of `any` in business logic.
- **Dependency Rule:** Domain layers must not import modules from the Infrastructure or App hosts.

### 2. API Standards
- **REST Design:** Clean path naming, version prefixes (`/api/v1/`), standard HTTP status codes, and JSON payloads.
- **Idempotency:** Write requests must require an `Idempotency-Key` header.

### 3. Database Standards
- **Snake Case:** All tables, columns, indexes, and constraints must use snake case.
- **Constraints:** Foreign key constraints are required. Columns storing money must use `numeric(15, 4)` types.

### 4. Logging & Telemetry
- **Structured Logs:** Must include tenant ID, request ID, execution context, and action code.
- **LogLevels:** Error levels are reserved for operational failures. Business warnings must use Warn levels.

---

## Part XVI: Architecture Fitness Tests

Automated verification tests running in the CI/CD pipeline to ensure architectural compliance.

- **Decoupling Validation:** Scans imports inside modules to verify that no business module directly imports another module's internal files.
- **RLS Verification:** Automatically checks database tables to ensure RLS is enabled and policies are defined.
- **Strict Dependency Linting:** Prevents circular dependency cycles between packages.

---

## Part XVII: Reference Implementations

The monorepo contains complete reference implementations of core architecture patterns.

- **Postgres Transactional Outbox:** Demonstrates how to write events and update entities inside a single database transaction.
- **Dynamic Form Render:** Demonstrates how to parse form schemas and generate interactive user interfaces.
- **ReAct Agent Loop:** Reference loop showing prompt variables injection, tool execution, and guardrail validation.

---

## Part XVIII: Complete 10-Phase Roadmap

### Phase 1: Core Platform Foundation (Kernel & CDM)
- [x] Concurrency-safe Numbering Engine and Audit Logs
- [x] Working Calendar and Time calculation tables
- [x] Standard Value Objects (Money, Party, Address, Quantity)
- [x] Multi-currency Ledger & Exchange Rate services
- [x] Tenant row-level security configuration

### Phase 1.5: Command Pipeline & CQRS
- [x] Base Command schemas and Validation pipelines
- [x] Authorization guards calling AccessService
- [x] Idempotency Registry and Interceptor middleware
- [x] Distributed Lock middleware integrations

### Phase 2: Event Sourcing & Projections
- [x] Projection engine infrastructure with schema versioning
- [x] Replay Platform and state snapshot engine
- [x] Read Models (P&L, Pipeline, Search Index)
- [x] OLAP Data Warehouse export pipeline

### Phase 3: Platform Services
- [x] Multi-channel Notification platform (Email, SMS, Slack, Teams)
- [x] Feature Flags & Configuration engines
- [x] Background Job queues & Schedulers
- [x] Reliability SRE middlewares (Circuit breaker, Rate limiter)

### Phase 4: Integration Platform & Ecosystem
- [x] API catalog and dynamic SDK code generation
- [x] Outbound connector adapters and circuit breakers

### Phase 5: AMC & Service Module
- [x] Scaffolding and domain entities (Contracts, Work Orders, Tickets, SLA)
- [x] Dispatch board and scheduler dashboard
- [x] GIS coordinates filtering integration

### Phase 6: Builder Platform (Dynamic Engines)
- [x] Metadata-driven Form & Entity registry
- [x] Approval Matrix Engine & Rules DSL
- [x] Visual Designers (Form, Workflow, Report builders)
- [x] BPMN Workflow Orchestration

### Phase 6.5: Next-Gen Intelligence
- [x] AI Context Engine & Digital Twin Projections
- [x] Process Mining, Resource Planning, & Cashflow Forecasts
- [x] Semantic API (MCP Server) configuration
- [x] AI Platform (Prompt, Tool, Agent Registries)
- [x] AI Safety & Guardrails Enforcement layers

### Phase 7: Business Module Depth
- [ ] Implementing ERP module workflows (CRM, Tendering, Estimating, Finance, Subcontracts, Inventory, HR, Fleet, Assets) from prioritized backlog.

### Phase 8: Observability & Hardening
- [ ] Telemetry integration (OpenTelemetry, Prometheus)
- [ ] Compliance verification dashboard
- [ ] Secrets management and zero-downtime CI/CD deployment pipelines

### Phase 9: Edge Client Applications
- [ ] Portals: Customer Portal, Supplier Portal
- [ ] Mobile PWA for field personnel (offline synchronization)
- [ ] Universal Command Palette and Inbox

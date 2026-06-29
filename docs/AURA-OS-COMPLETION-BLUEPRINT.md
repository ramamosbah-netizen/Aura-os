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

## Part X: Experience Platform (L5 UI Architecture)

Unified interfaces for internal and external actors. The Experience Layer acts as an "Operating System in the Browser" (not a traditional flat ERP), built on the following UI/UX architectural laws:

### 1. Visual Density & Cognitive Load Control
To mitigate cognitive overload and visual fatigue from dense data cockpit views, all primary workspaces must follow a **Three-Layer View Segregation**:
* **Layer 1: Core View (Default):** High-level card indicators, active status, core metadata, and primary action buttons.
* **Layer 2: Analysis View:** Interactive charts, cost projections, cashflow forecasts, and AI insights panel.
* **Layer 3: Deep Dive:** WBS hierarchy grid, transaction ledger detail, audit logs, and raw input forms.
* **Simplified / Executive Mode:** A system-wide toggle that collapses Layer 3 deep-dive panels, rendering a clean, streamlined dashboard optimized for executive users.

### 2. Monolithic Component Decomposition Rule
* To ensure optimal lazy-loading, code-splitting, and render performance, UI components must be kept modular.
* **Size Boundary:** Single file components must not exceed **30KB**. High-complexity workspaces (such as project or tender details) must be split into sub-components (e.g. `<WbsGrid />`, `<CostMatrix />`, `<AiPanel />`).

### 3. Context-First Routing
AURA OS navigates by context rather than strictly by module. The URL structure must support contextual workspaces:
* `/workspace/:tenant/:projectId` — Project-scoped context containing engineering, procurement, and site entries.
* `/inbox` — Global aggregated approvals inbox, decoupled from individual modules.
* `/universal-search` — Global command and entity locator interface.

### 4. BFF Orchestration Isolation
* The Next.js BFF (`apps/web/app/api/`) is strictly restricted to **orchestration and session security** (cookie extraction, JWT injection, response caching, payload formatting).
* Business validation, transactional calculations, RLS assertions, and core data storage must remain inside the NestJS api backend to prevent Next.js from becoming a duplicate backend.

### 5. Multi-Company Switcher Context
The company context switcher in the top shell header must perform a full **Context Rehydration**:
* Clears local UI caching states.
* Refreshes BFF-level cookies and updates NestJS session identity contexts.
* Redirects to the active company workspace without triggering a full page reload.

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

## Part XVIII: Complete Developed Roadmap (V8 + V6.0 Synthesis)

> Synthesized from: V8 Enterprise Architecture Standard, V2 Blueprint, V2 Module Map, Master Blueprint (0.2), GAP Analysis, BOP Transition Report, Full Implementation Report, 57 implementation reports, and the v6.0 Strategic Enhancement Report.

---

### 1. Platform Maturity Scorecard

| Layer | Current | Target | Primary Gap |
|---|---|---|---|
| L1 Kernel (Foundation) | 90% | 100% | Builder API endpoints, CDM value objects |
| L2 Modules (Backend) | 92% | 100% | AMC service UI, module depth pages |
| L2 Modules (Frontend) | 60% | 95% | 7 modules need deeper page coverage |
| L3 Intelligence (AI) | 72% | 98% | pgvector RAG, multi-agent DAG |
| L4 Optimization | 58% | 90% | Bid scoring, BIM viewer, profitability |
| L5 Experience (Frontend) | 70% | 95% | Company switcher, portals, theme controls |

---

### 2. Three-Tier Task Classification

* **Tier A — Product Layer:** End-user features and UIs (AMC dispatch, audit dashboard, BOQ parser, company switcher).
* **Tier B — Platform Layer:** Composable SDKs and engines (Plugin SDK, builder APIs, MDM, rules engine, semantic KPIs).
* **Tier C — Infrastructure Layer:** Scaling data and logging pipelines (pgvector, event streaming, telemetry, data lakehouse).

---

### 3. Dependency Graph

1. **Builder API (K1)** → Low-Code Form/Flow Designer (P3)
2. **Master Data Management (P5)** → Semantic KPI Layer (P6) → Data Lakehouse (P10)
3. **Plugin SDK (P1)** → App Marketplace (P2)
4. **pgvector RAG (I1)** → Multi-Agent DAG System (A1) → Digital Twin Simulator (A2)
5. **Event Streaming Backbone (S2)** → Real-time Event Subscriber (I2)

---

### 4. SaaS Packaging & Feature Gating

| Capability | Core ($49/u/mo) | Professional ($99/u/mo) | Enterprise ($199/u/mo) |
|---|---|---|---|
| Modules | CRM, Tendering, Projects, HR, Finance | + Procurement, Subcontracts, Assets, AMC | + Full Composable Stack |
| Tenancy | Single Company | Multi-Company Switcher | Dedicated Instance |
| AI | Centralized Chatbot | pgvector Document RAG | Multi-Agent DAGs |
| Workflows | Read-Only Templates | Custom Rule Parameters | Full Visual BPMN Designer |
| Analytics | In-Memory Summaries | Daily Projections | ClickHouse OLAP Lakehouse |

---

### 5. Agentic AI Governance

* **Tool Registry:** Every LLM tool maps to a verified API controller with RBAC checks.
* **Rate Limiting:** Request ceilings per agent, tenant, and IP prevent runaway loops.
* **Token Budgets:** Dollar-value limits per tenant per billing cycle; graceful fallback to rule-based operations.
* **AI Decision Log:** All agent routing, prompts, and tool calls persist to `aura_ai_decision_log`.
* **Safety Thresholds:** PO.amount < 10,000 AED → autonomous; ≥ 10,000 → human approval; bank routing changes → blocked.

---

### 6. Plugin Sandbox & Certification

* **Process Sandbox:** Worker threads with 256MB memory caps and 3s timeouts.
* **DB Isolation:** Plugins use dedicated read-replica schemas; interact with core only via event bus.
* **Certification Pipeline:** Code review + cryptographic signing before marketplace listing.

---

### 7. Event Streaming Graduation

* **Stage 1 (Current):** PostgreSQL `SKIP LOCKED` polling — up to 2,000 tx/sec.
* **Stage 2 (Scale):** Redis Streams — up to 10,000 tx/sec.
* **Stage 3 (Enterprise):** NATS JetStream — >10,000 tx/sec.

---

### 8. Complete Execution Plan — All Tasks

#### Phase 1: Core Platform Foundation (Kernel & CDM) ✅
- [x] Concurrency-safe Numbering Engine and Audit Logs
- [x] Working Calendar and Time calculation tables
- [x] Standard Value Objects (Money, Id)
- [x] Multi-currency Ledger & Exchange Rate services
- [x] Tenant row-level security configuration (RLS)
- [x] AsyncLocalStorage Tenant Context

#### Phase 1.5: Command Pipeline & CQRS ✅
- [x] Base Command schemas and Validation pipelines
- [x] Authorization guards (RBAC + ABAC with approval ceiling)
- [x] Idempotency Registry and Interceptor middleware
- [x] Distributed Lock middleware (advisory locks)

#### Phase 2: Event Sourcing & Projections ✅
- [x] Append-only Event Store (postgres + in-memory adapters)
- [x] Event Bus with wildcard subscribers
- [x] Transactional Outbox Relay (SKIP LOCKED + DLQ)
- [x] Event Catalog (60+ event types, self-healing registry)
- [x] Dead-letter queue with configurable MAX_ATTEMPTS
- [x] Read Models (P&L, Pipeline, Search Index)

#### Phase 3: Platform Services ✅
- [x] Multi-channel Notifications (Email, SMS, Slack, Teams)
- [x] Feature Flags & Configuration engines
- [x] Background Job queues & Schedulers
- [x] SRE middlewares (Circuit breaker, Rate limiter, Bulkhead)

#### Phase 4: Integration Platform & Ecosystem ✅
- [x] API catalog and dynamic TypeScript SDK generation
- [x] Outbound connector adapters (SAP, Procore, Dynamics)
- [x] Webhook dispatcher with retry worker

#### Phase 5: AMC & Service Module (Backend) ✅
- [x] Domain entities (Contracts, Work Orders, Tickets, SLA)
- [x] SLA breach algorithms and dispatch rules
- [x] GIS coordinates filtering (Dubai/Abu Dhabi geofences)

#### Phase 6: Builder Platform (Dynamic Engines) ✅
- [x] Metadata-driven Form & Entity registry
- [x] Approval Matrix Engine & Rules DSL
- [x] Visual Template Builder (22KB component)
- [x] BPMN Workflow Orchestration engine

#### Phase 6.5: Next-Gen Intelligence ✅
- [x] AI Context Engine & Digital Twin Projections
- [x] Process Mining & bottleneck discovery
- [x] Cashflow Forecasts & Resource Planning
- [x] MCP Server Gateway configuration
- [x] AI Platform (Prompt, Tool, Agent Registries)
- [x] AI Safety & Guardrails (PII masking, keyword filtering, token limits)
- [x] Multi-provider AI substrate (Claude, OpenAI, Gemini failover)

#### Phase 7: Business Module Depth ✅
- [x] 16/16 business modules with full vertical slices (domain → service → store → migration → test → controller → UI)
- [x] Cross-module event wiring (Tender→Contract→Project→PO→GRN→Invoice chain)
- [x] IEC 4-layer closed-loop pricing engine
- [x] CBS domain + summary calculator
- [x] EVM domain (WBS CPI/SPI roll-up)
- [x] Autonomy proposal queue with execute/reject controls
- [x] Project P&L ledger projections
- [x] Executive briefing engine
- [x] Pipeline revenue forecasting

#### Phase 8: Operational MVP (8 Weeks) — ▓▓ ACTIVE
**Weeks 1-2 — Core Hardening & Admin Gates:**
- [ ] NestJS `BuilderController` REST endpoints (CRUD for forms, workflows, approval matrices)
- [ ] Multi-company context switcher (header dropdown + `/api/auth/switch-company`)
- [ ] Audit trail browser UI (`/admin/audit` with search filters)
- [ ] Shared CDM value objects: Party, Address, Period, Quantity, Location

**Weeks 3-4 — Service Operations UI:**
- [ ] AMC/Service dashboard (`/amc` route with tickets list + SLA timers)
- [ ] GIS dispatch board (Mapbox/Leaflet map with work order pins)
- [ ] Technician schedule grid (drag-and-drop assignment)

**Weeks 5-6 — Structured Data Ingestion:**
- [ ] Server-side Excel BOQ parser (`xlsx` library + multipart upload)
- [ ] BOQ cost recalculation engine (auto-update project CBS totals)
- [ ] Dynamic hierarchical RLS policies (tenant→company→branch→project)

**Weeks 7-8 — Basic AI & Verification:**
- [ ] `pgvector` RAG embeddings storage (document index vectors)
- [ ] Autonomy Proposals Queue UI integration (execute/reject controls)
- [ ] Double-entry financial integrity trigger (Sum(Debits) = Sum(Credits))
- [ ] Correlation ID tracing (`x-correlation-id` across outbox + audit log)

#### Phase 9: Module Depth Expansion — ░░ BACKLOG
**CRM & Sales:**
- [ ] Marketing campaigns and lead source tracking
- [ ] Customer segments and profitability views
- [ ] Quotation template engine

**Tendering & Estimating:**
- [ ] Vendor RFQ workflow and bid comparison
- [ ] Full estimation breakdown (Material, Labour, Equipment, Subcontract, Indirect, Overheads, Risk, Margin)
- [ ] Bid/No-Bid AI scoring (7-criteria engine)
- [ ] BIM-to-BOQ IFC GUID linkage

**Projects:**
- [ ] EVM calculation dashboard (PV/EV/AC/CPI/SPI visual charts)
- [ ] Delay Analysis & Extension of Time (EOT) claims
- [ ] Client Variation Orders workflow
- [ ] Resource planning matrix

**Procurement:**
- [ ] RFQ workflow with vendor comparison matrix
- [ ] Blanket PO & Framework Agreements
- [ ] Call-Off Orders
- [ ] 3-Way Match UI (PO↔GRN↔Invoice)

**Inventory:**
- [ ] Multi-warehouse management
- [ ] Site stores, transfers, and reservations
- [ ] Cable drum tracking & tool store (issue/return)

**Finance:**
- [ ] VAT dashboard depth and compliance reporting
- [ ] Bank reconciliation engine
- [ ] Treasury management and bonds tracking
- [ ] Intercompany transactions and group consolidation
- [ ] Revenue recognition (IFRS 15) and WIP accounting

**Subcontracts:**
- [ ] Retention release workflow depth
- [ ] Back-charges register

**Engineering:**
- [ ] Method statements and design change registers

**Site Control:**
- [ ] Progress photos integration
- [ ] Site instructions log

**HSE:**
- [ ] Toolbox talks register
- [ ] Safety observations tracker

**Quality:**
- [ ] CAR (Corrective Action Reports)
- [ ] ITP/QA Plans and checklists

**HR & Payroll:**
- [ ] Visa/permit tracking and renewal alerts
- [ ] Labour camp management
- [ ] Training and certifications register
- [ ] EOSB/gratuity calculator

**Fleet:**
- [ ] GPS integration and live vehicle tracking
- [ ] Salik toll gate tracking
- [ ] Traffic fines register
- [ ] Utilization and total cost of ownership analytics

**Assets:**
- [ ] Warranty management depth
- [ ] Depreciation scheduling and disposal workflow

#### Phase 10: Intelligence & Optimization Upgrade — ░░ BACKLOG
- [ ] Unified observer (wildcard `*` event subscriber for real-time intelligence)
- [ ] Role-specific AI agents (CFO, PM, Supply Chain, HR agent logic)
- [ ] LangGraph DAG orchestrator (multi-agent state routing)
- [ ] Agent rate limiting and token budget controls
- [ ] AI decision audit log (`aura_ai_decision_log` table)
- [ ] 7-criteria bid scoring engine (Value, Margin, Competitors, Resources, Risk, Fit, Working Capital)
- [ ] Client profitability / LTV analyzer
- [ ] BIM 3D viewer (Autodesk APS canvas in estimation screens)
- [ ] Document Intelligence / OCR engine (PDF/CAD extraction)
- [ ] Financial guarantees / bonds service
- [ ] Knowledge graph (entity relationship mapping)

#### Phase 11: Platform Transition (Developer Ecosystem) — ░░ BACKLOG
- [ ] Plugin SDK adapter framework (lifecycle hooks: discover, install, run, stop, uninstall)
- [ ] Plugin versioning model (strict SemVer with dependency conflict checks)
- [ ] Plugin sandbox isolation (worker thread VM + dedicated DB schemas)
- [ ] App Marketplace registry and metadata schema
- [ ] Master Data Management (MDM) golden records engine
- [ ] MDM approval queues and steward workflows
- [ ] Semantic KPI analytics layer (unified metric definitions)
- [ ] Declarative business rules engine (JSON-based rule evaluator)
- [ ] Low-code visual form designer (drag-and-drop)
- [ ] Low-code BPMN workflow designer (React Flow / bpmn-js)
- [ ] Developer CLI (`npx aura-cli generate-plugin`)
- [ ] API Explorer (live Swagger sandbox)

#### Phase 12: Global Scaling (Infrastructure) — ░░ BACKLOG
- [ ] Event streaming upgrade: Redis Streams → NATS JetStream
- [ ] ClickHouse analytics data lakehouse (CDC from Postgres WAL)
- [ ] OpenTelemetry tracing and metrics (Prometheus/Grafana export)
- [ ] Centralized structured logging with correlation IDs
- [ ] Tenant-scoped feature flag rollout system
- [ ] Multi-region active-active deployment routing
- [ ] Zero-downtime canary deployment pipelines
- [ ] Offline sync engine with CRDT conflict resolution
- [ ] Data governance: lineage tracking, classification, retention policies

#### Phase 13: Edge Applications — ░░ BACKLOG
- [ ] Customer Portal (view/approve quotations, invoices, AMC tickets, documents)
- [ ] Supplier Portal (receive RFQ, submit quotes, view PO, submit invoice, track payment)
- [ ] Mobile Workforce PWA (offline daily reports, photos, attendance, snags, PTW, dispatch)
- [ ] BI & Analytics dashboards (Executive, CFO, COO, PM, Procurement, Sales)
- [ ] Global search (top-bar entity retrieval)
- [ ] Universal inbox / notification center
- [ ] Theme switcher (Dark/Light mode toggle)
- [ ] Table density control (Compact/Cozy presets)
- [ ] IoT / Remote Monitoring integration (AMC asset telemetry)

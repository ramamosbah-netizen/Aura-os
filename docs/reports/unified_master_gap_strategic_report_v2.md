# AURA OS — Unified Master Gap & Strategic Enhancement Report (v2.0)

> **Document Class:** Strategic Product & Engineering Architecture Blueprint  
> **AURA OS Target:** Evolution from a Bounded Enterprise ERP + AI system to a global **Enterprise Operating System Platform** (SAP + Salesforce + ServiceNow + Power Platform in one unified engine).

---

## 1. Executive Summary & Maturity Scorecard

AURA OS is built on advanced modern architectural patterns (Event-Driven Bounded Contexts, CQRS command buses, AsyncLocalStorage tenancy, and transactional outbox Relays). However, to transition the system from an **Enterprise Internal ERP** to a **Universal SaaS Platform**, several operational, architectural, and strategic gaps must be resolved.

### Platform Maturity Dashboard (V2.0 Core)

| Architectural Layer | Current Maturity | Primary Focus Area |
| :--- | :--- | :--- |
| **L1 Kernel (Core)** | 90% | Expose Builder API endpoints and administrative gates. |
| **L2 Business Modules (Backend)** | 92% | Standardize domain interfaces and event structures. |
| **L2 Business Modules (Frontend)** | 60% | Complete the `/amc` and `/subcontracts` UI. |
| **L3 Intelligence (AI)** | 72% | Deploy `pgvector` RAG and cross-context multi-agent workflows. |
| **L4 Optimization** | 58% | Implement the 7-Criteria Bid Scorer and BIM 3D visual quantity takeoffs. |
| **L5 Experience (Frontend)** | 70% | Implement Multi-company contexts and table density controls. |

---

## 2. Operational Implementation Gaps

These are critical missing features where backend code has been implemented but frontend/API support is missing.

### L1 Kernel (Core)
* **K1 — Dynamic Builder API & Administrative Gates:**
  * *Status:* The backend workflow engine and form validator work using hardcoded/seeded JSON schemas.
  * *Gap:* Missing NestJS REST controllers to register, update, and manage form registers, workflows, or approval matrices dynamically.
  * *Solution:* Implement `BuilderController` endpoints with versioning support inside `apps/api/src/builder/`.
* **K2 — Audit Trails UI Browser:**
  * *Status:* The audit log service logs details to `aura_audit_log`.
  * *Gap:* No user interface exists to search or view audit records.
  * *Solution:* Build a `/admin/audit` portal route in `apps/web` with search filters.

### L2 Business Modules
* **M1 — AMC & Service Frontend UI (100% Missing):**
  * *Status:* Backend `@aura/amc` handles service contracts, priority GIS work orders, and ticket SLAs.
  * *Gap:* No routes, GIS maps, or dispatch boards exist in the frontend.
  * *Solution:* Build a `/amc` workspace with an interactive dispatch board (Mapbox/Leaflet pin allocations) and technician schedules.
* **M2 — Non-Simulated Excel/PDF BOQ Import Parser:**
  * *Status:* The frontend has a simulated AI OCR/Excel import modal.
  * *Gap:* No actual server-side file parser exists. Uploading files has no effect.
  * *Solution:* Integrate an Excel parsing library (e.g., `xlsx`) on the API server to structure upload payloads into database records.

### L3 Intelligence (AI)
* **I1 — Vector DB Support (`pgvector`):**
  * *Status:* AI Context engine operates using standard in-memory/string search algorithms.
  * *Gap:* No vector database embeddings storage.
  * *Solution:* Set up `pgvector` in PostgreSQL to store document and correspondence embeddings.
* **I2 — Unified Event Stream Subscriber:**
  * *Status:* Intelligence projections update on-demand.
  * *Gap:* Missing a unified stream subscriber tracking all domain events to update widgets in real-time.
  * *Solution:* Deploy a wildcard event handler (`*`) feeding live metrics to role dashboards.

### L4 Optimization
* **O1 — 7-Criteria Bid Scoring Engine:**
  * *Status:* Estimates do not calculate margin risks or bid readiness factors.
  * *Gap:* Tenders lack suitability scores.
  * *Solution:* Build a scoring engine evaluating: Value, Margin, Competitors, Resource Availability, Risk, Project Fit, and Working Capital.
* **O2 — BIM 3D Canvas Integration:**
  * *Status:* BOQ items contain partial `ifc_guid` pointers.
  * *Gap:* No 3D model viewer is rendered.
  * *Solution:* Embed an Autodesk Platform Services (APS) Viewer canvas in the estimation workspace.

### L5 Experience (Frontend)
* **E1 — Multi-Company Context Switcher:**
  * *Status:* Single-company logins.
  * *Gap:* No header selector to switch between active subsidiaries.
  * *Solution:* Build a company selector calling `/api/auth/switch-company` to update session context.
* **E2 — Theme & Table Density Presets:**
  * *Status:* Layout grids use fixed spacing variables.
  * *Gap:* Dense tables with thousands of rows are difficult to read without compact display options.
  * *Solution:* Implement a layout density context toggle (Compact vs. Cozy).

---

## 3. Platform Architectural Gaps

To evolve AURA OS into a developer-friendly platform ecosystem, several platform services must be built:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AURA PLATFORM ECOSYSTEM                         │
├──────────────────────────┬──────────────────────────┬──────────────────┤
│    Plugin SDK / CLI      │    App Marketplace       │ Low-Code Engines │
│  Build custom extensions │ Download modular extensions│ Visual Form/Flow │
└──────────────────────────┴──────────────────────────┴──────────────────┘
```

* **P1 — Plugin SDK & Runtime Hook Interceptors:**
  * *Gap:* No mechanism exists to install third-party plugins.
  * *Solution:* Standardize code adapters and interceptors so external packages can register routes and subscribe to events without modifying the core codebase.
* **P2 — App Marketplace Schema:**
  * *Gap:* No repository for modular extensions.
  * *Solution:* Design a registry schema for publishing and downloading verified modules.
* **P3 — Visual Low-Code Engine:**
  * *Gap:* Form creation and workflow pathways must be coded manually.
  * *Solution:* Build drag-and-drop form designers and visual BPMN workflow editors.
* **P4 — Developer Portal & CLI:**
  * *Gap:* Lacks scaffolding tools.
  * *Solution:* Build a CLI command generator (`npx aura-cli generate-plugin`) and interactive API sandbox.
* **P5 — Master Data Management (MDM):**
  * *Gap:* Bounded contexts maintain separate lists of customers, suppliers, and materials.
  * *Solution:* Build a centralized MDM service to sync core references across CRM, Procurement, and Inventory.
* **P6 — Semantic KPI Analytics Layer:**
  * *Gap:* Financial and project reports compute calculations independently.
  * *Solution:* Define a unified semantic metadata layer mapping metrics definitions (e.g., net margin, gross profit).
* **P7 — Centralized Observability Hub:**
  * *Gap:* System performance, logs, and distributed database traces are not consolidated.
  * *Solution:* Instrument the NestJS app with OpenTelemetry to export metrics to Prometheus/Grafana.
* **P8 — Tenant-Scoped Feature Flags:**
  * *Gap:* Features are enabled globally for all accounts.
  * *Solution:* Extend the feature flag engine to roll out features based on tenant license tiers.
* **P9 — Declarative Business Rules Engine:**
  * *Gap:* Rule validations are hardcoded within domain entities.
  * *Solution:* Implement a JSON-based rule engine to run validations outside compile scopes.
* **P10 — Analytics Data Lake Integration:**
  * *Gap:* Analytical queries run directly on the transaction database.
  * *Solution:* Set up logical replication to export event logs to an OLAP Data Lakehouse (e.g. ClickHouse or DuckDB).

---

## 4. Strategic AI & Intelligence Evolution

Transition the centralized AI assistant into a collaborative network of specialized agents.

```
                                  AI COORDINATOR
      ┌───────────────────────┬───────────┴───────────┬───────────────────────┐
      ▼                       ▼                       ▼                       ▼
┌───────────┐           ┌───────────┐           ┌───────────┐           ┌───────────┐
│ CFO Agent │           │ PM Agent  │           │ Supply    │           │ HR Agent  │
│  (Capital │           │ (Schedule │           │ Chain     │           │ (Capacity │
│ & Ledger) │           │ & Delays) │           │ Agent     │           │ & Roster) │
└───────────┘           └───────────┘           └───────────┘           └───────────┘
```

* **A1 — Multi-Agent AI System:**
  * *CFO Agent:* Optimizes cash flows, flags unpaid invoices, and validates budget lines.
  * *PM Agent:* Monitors project delays, forecasts delays, and drafts extension of time (EOT) claims.
  * *Supply Chain Agent:* Rates vendor risks and monitors materials pricing trends.
  * *HR Agent:* Optimizes crew allocations based on historical productivity and certifications.
* **A2 — Digital Twin Scenario Simulation ("What-If" Analysis):**
  * Simulates project outcomes (e.g., *"What is the impact on margin and schedule if steel rebar costs increase by 15% and shipping is delayed by 10 days?"*).
* **A3 — Collaborative Agent Decision Chains:**
  * Enables agents to collaborate on solutions (e.g., the PM Agent flags a site delay; the Supply Chain Agent finds alternative suppliers; the CFO Agent calculates cash flow impacts).
* **A4 — Predictive Enterprise AI Models:**
  * Moves from reactive dashboards to proactive alerts forecasting risk indices and delay potentials.

---

## 5. Engineering Improvements & Infrastructure Scalability

* **S1 — Domain API Gateway:** Replace isolated module API endpoints with a unified gateway layer.
* **S2 — Event Streaming Backbone:** Replace PostgreSQL transactional polling relays with low-latency brokers (e.g., Redis Streams, NATS, or Apache Kafka) for high-frequency messaging.
* **S3 — CQRS Projection Separation:** Offload query handling to dedicated read replica databases.
* **S4 — Multi-Region Tenant Routing:** Route requests to regional database instances using tenant context headers.
* **S5 — Data Governance & Lineage Engine:** Track column-level lineage and automate regulatory data retention rules.

---

## 6. The 4-Phase Implementation Roadmap

```
  Phase 1: Product Completion   ├── AMC UI · Builder APIs · Ingestion Parser · Audit UI
  Phase 2: Intelligent Upgrade  ├── pgvector RAG · Bid Scorer · Event Streaming · BIM
  Phase 3: Platform Transition  ├── Plugin SDK · Marketplace · Low-Code UI · MDM Engine
  Phase 4: Global Scaling       ├── Data Lakehouse · Multi-Agent AI · Observability
```

---

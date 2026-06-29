# AURA OS — Master Blueprint Task Map

> **Document Class:** Platform Reference & Implementation Roadmap Map  
> **Status Summary:** Phases 1 through 6.5 (Kernel, CQRS, Projections, Platform Services, Integrations, AMC Backend, Builder Backend, Intelligence Backend) are fully implemented and verified. The active focus is **Phase 1: Operational Completion (The MVP)**.

---

## 🗺️ Master Roadmap & Phase Task Grid

```
                  ┌──────────────────────────────┐
                  │   Phase 4: Global Scaling    │ ░░ 0% (downstream)
                  └──────────────▲───────────────┘
                                 │
                  ┌──────────────┴───────────────┐
                  │  Phase 3: Platform Transition│ ░░ 0% (downstream)
                  └──────────────▲───────────────┘
                                 │
                  ┌──────────────┴───────────────┐
                  │ Phase 2: Intelligent Upgrade │ ░░ 0% (downstream)
                  └──────────────▲───────────────┘
                                 │
                  ┌──────────────┴───────────────┐
                  │ Phase 1: Operational MVP     │ ▓▓ 15% (active)
                  └──────────────▲───────────────┘
                                 │
                  ┌──────────────┴───────────────┐
                  │      Foundation Core         │ ██ 100% (completed)
                  │      (Phases 1 - 6.5)        │
                  └──────────────────────────────┘
```

---

## 🛠️ Complete Task Breakdown Ledger

---

### 🟢 Foundation Core (Phases 1 to 6.5) — 100% Completed

These phases establish the modular foundation and database layers.

#### Phase 1: Core Platform Foundation (Kernel & CDM)
* [x] **T1.1: Concurrency-Safe Numbering Engine:** Sequence tracking table.
  - *Artifacts:* `0028_kernel_numbering.sql`, `numbering.service.ts`
* [x] **T1.2: Immutable Audit Log Engine:** State changes ledger.
  - *Artifacts:* `0029_kernel_audit.sql`, `audit.service.ts`
* [x] **T1.3: Working Calendar Services:** Operational holidays calculator.
  - *Artifacts:* `0030_kernel_calendar.sql`
* [x] **T1.4: Exchange Rate Services:** Multi-currency ledgers.
  - *Artifacts:* `0031_kernel_exchange_rate.sql`
* [x] **T1.5: Tenant Row-Level Security (RLS):** Database tenant isolation.
  - *Artifacts:* `0032_kernel_rls_policies.sql`

#### Phase 1.5: Command Pipeline & CQRS
* [x] **T1.5.1: Command Schema Validation:** Payload parsing.
* [x] **T1.5.2: Authorization Guard:** Access validation.
  - *Artifacts:* `permissions.guard.ts`, `permissions.decorator.ts`
* [x] **T1.5.3: Idempotency Registry:** Prevent duplicate operations.
  - *Artifacts:* `0033_kernel_idempotency.sql`, `idempotency.interceptor.ts`
* [x] **T1.5.4: Transactional Locks:** Advisory locks.
  - *Artifacts:* `lock.service.ts`

#### Phase 2: Event Sourcing & Projections
* [x] **T2.1: Projection Engine:** Event handler and version registry.
  - *Artifacts:* `postgres-event-store.ts`, `outbox-relay.ts`
* [x] **T2.2: Replay Platform:** State reconstruction.
* [x] **T2.3: Read Models:** Real-time search indexing.

#### Phase 3: Platform Services
* [x] **T3.1: Multi-Channel Notifications:** Email, SMS, Slack, MS Teams integrations.
  - *Artifacts:* `notification.service.ts`
* [x] **T3.2: Config & Feature Flags:** Rollout flags by tenant.
  - *Artifacts:* `feature-flag.service.ts`
* [x] **T3.3: Background Job Queues:** Concurrent job queues (`SKIP LOCKED`).
  - *Artifacts:* `background-job.service.ts`
* [x] **T3.4: SRE Middleware:** Circuit breaker and rate limiters.
  - *Artifacts:* `circuit-breaker.ts`, `rate-limiter.ts`

#### Phase 4: Integration Platform & Ecosystem
* [x] **T4.1: API Catalog Wrapper:** OpenAPI documentation.
* [x] **T4.2: Dynamic SDK Generator:** Auto-generates TypeScript client SDK wrappers.
  - *Artifacts:* `sdk-generator.service.ts`
* [x] **T4.3: Outbound Adapters:** SAP and Procore adapter mappings.
  - *Artifacts:* `connector.service.ts`

#### Phase 5: AMC & Service Backend
* [x] **T5.1: AMC Domain Entities:** SLAs, Work Orders, Tickets.
  - *Artifacts:* `modules/amc/src/domain/`
* [x] **T5.2: Dynamic Dispatch Rules:** SLA breach check algorithms.
  - *Artifacts:* `amc.service.ts`
* [x] **T5.3: GIS Coordinates Mapping:** Dubai and Abu Dhabi geofence boundaries.

#### Phase 6: Builder Platform (Dynamic Engines)
* [x] **T6.1: Form & Entity Registry:** Database-driven form structures.
* [x] **T6.2: Approval Matrix Rules:** DMN threshold routing logic.
* [x] **T6.3: BPMN Workflow Orchestrator:** Dynamic execution engines.
  - *Artifacts:* `workflow.service.ts`

#### Phase 6.5: Next-Gen Intelligence (AI)
* [x] **T6.5.1: Digital Twin Projections:** AI Context aggregates.
  - *Artifacts:* `ai-context.engine.ts`
* [x] **T6.5.2: Process Mining Engine:** System bottleneck logs tracker.
  - *Artifacts:* `process-mining.service.ts`
* [x] **T6.5.3: AI safety Guardrails:** PII masks and token budgeting.
  - *Artifacts:* `ai-guardrails.service.ts`

---

### ▓▓ Active Phase: Operational MVP (Weeks 1 to 8) — 15% Completed

These tasks address the immediate product backlog to deliver the first stable release.

#### Weeks 1-2: Core Hardening & Security Gates
* [ ] **T7.1: NestJS Builder REST Endpoints:** Dynamic form and workflow CRUD controllers.
* [ ] **T7.2: Multi-Company Context Switcher UI:** Header context selection widget.
* [ ] **T7.3: Audit Trails Browser UI:** Search and view logs dashboard.

#### Weeks 3-4: AMC / Service Operations UI
* [ ] **T7.4: Service & Facilities Dashboard:** Support tickets and SLA timers list.
* [ ] **T7.5: GIS Map Dispatch Board:** Pins and drag-and-drop technician schedules.

#### Weeks 5-6: Structured Estimating Data Ingestion
* [ ] **T7.6: Excel BOQ parser integration:** server-side parser (using `xlsx`).
* [ ] **T7.7: BOQ Recalculation Engine:** Auto-updating project CBS totals.

#### Weeks 7-8: Basic AI Integration
* [ ] **T7.8: pgvector RAG Setup:** PostgreSQL document indexing search.
* [ ] **T7.9: Autonomy Queue UI Integration:** Proposal status controls (Execute/Reject).

---

### ░░ Downstream Phases (Future Platform Evolution) — 0% Completed

These phases outline the long-term roadmap to transition from an internal system to a global platform.

#### Phase 2: Intelligent Upgrade (AI & Optimization Layer)
* [ ] **T8.1: 7-Criteria Bid Scoring Engine:** Evaluating margins and risk suitability.
* [ ] **T8.2: Event Streaming Backbone:** Redis Streams/NATS integration.
* [ ] **T8.3: Autodesk APS 3D BIM Viewer:** Canvas component in estimation screens.
* [ ] **T8.4: AI Agent Orchestrator:** LangGraph state DAG execution.

#### Phase 3: Platform Transition (Platform Layer)
* [ ] **T9.1: Plugin SDK Adapter Framework:** Lifecycles and registration hooks.
* [ ] **T9.2: App Marketplace Registry:** Extension publishing schema.
* [ ] **T9.3: Master Data Management (MDM):** Centralized customer, supplier, and material logs.
* [ ] **T9.4: Composable Low-Code Designers:** Drag-and-drop form and workflow creators.

#### Phase 4: Global Scaling (Infrastructure Layer)
* [ ] **T10.1: ClickHouse Analytics Data Lake:** Logical replication of transaction records.
* [ ] **T10.2: OpenTelemetry Tracing:** Trace exports to Prometheus/Grafana.
* [ ] **T10.3: Multi-Agent AI System:** Department agents collaboration chains.

---

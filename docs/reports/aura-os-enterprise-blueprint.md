# Aura OS — Enterprise Capabilities Blueprint

This blueprint outlines the strategy to transform Aura OS from a modular monolith ERP into a Tier-1 Intelligent Enterprise Operating System, bridging the gaps between standard operations and global suites like SAP S/4HANA, Oracle Fusion, and IFS Cloud.

---

## 1. Top 3 Strategic Pillars & Immediate Architectures

To address the highest priority gaps, we have designed the core frameworks for the three critical pillars:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Enterprise Platform Core                        │
├───────────────────────────┬───────────────────────────┬────────────────┤
│    Execution Engine       │     Metadata Platform     │ Knowledge Base │
│  (Sagas, Compensations,   │ (Dynamic Fields, Entities,│ (AI context,   │
│   Queues, Task Runners)   │   Forms, Views, Policies) │  spec sheets)  │
└───────────────────────────┴───────────────────────────┴────────────────┘
```

### Pillar 1: Enterprise Execution Engine (Saga & Process Orchestrator)
**Status: Bootstrapped, Implemented, & Tested**
- **Saga Persistence**: Implemented database schema mapping (`0043_saga_execution_engine.sql`) to track transaction state (`pending`, `running`, `completed`, `failed`, `compensating`, `compensated`).
- **SagaOrchestratorService**: Created a core registry enabling multi-step workflows. If a step fails, the orchestrator triggers compensation actions on all previously completed steps in reverse order to roll back external state.
- **Verification**: Covered by unit and integration tests (`saga-orchestrator.service.test.ts`) validating successful execution, error capture, and correct compensation execution.

### Pillar 2: Enterprise Metadata Platform
- **Unified Registry**: Extends the existing `builder-platform` to manage schemas as pure metadata JSON structures.
- **Dynamic Entities**: Fields can be added dynamically on the tenant level with validations automatically populated to forms and database columns.

### Pillar 3: Enterprise Knowledge Platform
- **Institutional Context**: Links custom manuals, procedures, contracts, lessons learned, and templates.
- **Semantic Retrievability**: Feeds into the AI platform's guardrail and context engines to enhance LLM autonomy.

---

## 2. Comprehensive 25-Gap Strategy

Below is the design plan for all 25 Enterprise Gaps identified:

### Level 1 (Critical Gaps) ⭐⭐⭐⭐⭐
1. **Enterprise Metadata Platform**: Extend `EntityRegistryService` and `FormRegistryService` to define views, reports, dashboards, and permissions entirely via metadata.
2. **Enterprise Execution Engine**: Bootstrapped via `SagaOrchestratorService`. Future steps will integrate it with human task queues and long-running job schedulers.
3. **Enterprise Knowledge Platform**: Build a vector store indexer in the DMS to load specifications, company policies, and standards directly into the `AiContextEngine`.
4. **Universal Inbox**: Centralized `/api/inbox` BFF route aggregating workflow tasks, approval matrices, and mentions into a single Next.js list view.
5. **Enterprise Collaboration**: Implement a global comment thread schema linked to `aggregateType` and `aggregateId` supporting mentions (`@user`) and presence sockets.

### Level 2 (High Priority) ⭐⭐⭐⭐
6. **Enterprise Search Platform**: Construct a semantic search engine using pgvector or a specialized AI search model inside the AI platform module.
7. **KPI Engine**: Declare KPIs as objects with customizable formulas, refresh policies, and history trackers.
8. **Data Quality Platform**: Run scheduled jobs measuring completeness, duplicates, and freshness of master data.
9. **Reporting Platform**: Integrate custom PDF templates and Excel export engines.
10. **Enterprise Scheduler**: Centralize tasks from HR, Projects, Fleet, AMC, and Maintenance into a single schedule solver.

### Level 3 (Architecture Maturity) ⭐⭐⭐
11. **Service Catalog**: Document ownership, dependency graphs, SLAs, and health checks.
12. **Capability Catalog**: Expose capability maps to determine active/inactive features.
13. **Enterprise Object Registry**: Map relationship links between objects (e.g. Tendency -> Project -> Asset).
14. **Universal Timeline**: Track lifecycles through events (e.g. Created -> Submitted -> Approved -> Paid).
15. **Relationship Graph**: Traces flows across the database using foreign keys and transaction logs.

### Level 4 & 5 (Operational Excellence & Future Enterprise) ⭐⭐
16. **Chaos Engineering**: Automated tests to simulate event-bus failures or DB connection drops.
17. **Performance Platform**: Log query times and latency within NestJS interceptors.
18. **Feature Management**: Control rollout flags dynamically per tenant.
19. **Upgrade Platform**: Automate schema migrations and rollbacks.
20. **Runbooks**: Document operational procedures for startup, backup, and restore.
21. **Digital Thread**: Complete transactional lineage tracing from lead to asset replacement.
22. **Enterprise Digital Twin**: Mirror company organization structures, portfolios, and assets.
23. **Decision Intelligence**: AI briefings recommending strategic actions based on financial projections.
24. **Enterprise Simulation**: "What-If" modeling engine simulating project delay costs or material price inflation.
25. **Governance Dashboard**: Visualize security, data quality, compliance, and AI costs.

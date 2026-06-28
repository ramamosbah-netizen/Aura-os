# AURA OS — Transitioning to a Business Operating Platform (BOP)

> **Status:** Strategic Analysis & Recommendations  
> **Prepared For:** AURA Core Architecture Team  
> **Prepared By:** Antigravity (Google DeepMind Team)  
> **Date:** June 28, 2026

---

## 1. ERP vs. Business Operating Platform (BOP)

A traditional ERP functions primarily as a **system of record**—a database wrapper for financial ledgers, transactional purchases, and resource allocations. 

A **Business Operating Platform (BOP)** goes beyond this, serving as a **system of engagement and intelligence**. It orchestrates workflows, automates decision chains via AI agents, allows tenant customizations without coding, and scales dynamically via modular plugins.

```
  Traditional ERP (System of Record)
             │
             ▼
  Business Operating Platform (System of Engagement & Intelligence)
   • Metadata-Driven Layouts (No-Code forms & fields)
   • Decoupled Core Engines (Mathematical optimization, posting, rules)
   • AI Agents & Semantic APIs (MCP Server interface)
   • Shared Enterprise Data Graphs (Asset & Knowledge Graphs)
```

---

## 2. Platform Comparison & Identified Gaps

Based on a thorough review of the implementation report, the following gaps must be resolved to transform the current codebase into a complete Business Operating Platform:

| Category | Current ERP Status | Target BOP Capability | Priority | Action Plan |
|---|---|---|---|---|
| **Data Platform** | Isolated database tables per module. | Master Data Management (MDM) & Unified Knowledge/Asset Graph. | **High** | 1. Implement MDM approval queues. <br>2. Build `AssetGraph` and `KnowledgeGraph` models. |
| **Automation Platform** | Hardcoded workflows in TypeScript (`workflow.service.ts`). | Decoupled Rules Engine, BPMN 2.0 parser, AI Agent orchestrator. | **High** | 1. Implement Expression DSL parser. <br>2. Integrate BPMN schema executor. <br>3. Register AI Agents with tools. |
| **Operations Platform** | Basic JSON logs and database connection configs. | SRE proxies, FinOps telemetry, Compliance audit engines. | **Medium** | 1. Inject Circuit Breakers & Rate Limiters. <br>2. Create a dashboard for Compliance controls (VAT/GDPR/ISO). |

---

## 3. Concrete Code & Schema Improvements

### 3.1 Implementation of the Rules Engine (Expression Parser)
We must avoid hardcoding business limits (e.g. `if (po.amount > 500000)`). A generic parser must evaluate rule strings dynamically.
- **Path:** `platform/builder/rules-engine/rules.evaluator.ts`
- **TypeScript Implementation:**
  ```typescript
  export class RulesEvaluator {
    public static evaluate(expression: string, context: Record<string, any>): boolean {
      // Safe, sandbox execution of rules logic
      const keys = Object.keys(context);
      const values = Object.values(context);
      const fn = new Function(...keys, `return (${expression});`);
      try {
        return fn(...values);
      } catch (error) {
        throw new Error(`Failed to evaluate expression: ${expression}. Error: ${error.message}`);
      }
    }
  }
  ```

### 3.2 Master Data Management (MDM) Table Schemas
Ensures a single source of truth for core business contacts and inventories.
- **Path:** `infrastructure/migrations/0028_mdm_governance.sql`
- **SQL Schema:**
  ```sql
  CREATE TABLE public.mdm_golden_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    entity_type text NOT NULL, -- 'vendor' | 'customer' | 'material'
    payload jsonb NOT NULL,
    status text DEFAULT 'draft', -- 'draft' | 'pending_approval' | 'active'
    version int DEFAULT 1,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE public.mdm_approval_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    golden_record_id uuid REFERENCES public.mdm_golden_records(id),
    steward_id text NOT NULL,
    action text NOT NULL, -- 'approve' | 'reject'
    comments text,
    created_at timestamptz DEFAULT now()
  );
  ```

### 3.3 Semantic Model Layer
Translates database layouts into logical business definitions.
- **Path:** `platform/data/semantic/model.ts`
- **TypeScript Model:**
  ```typescript
  export interface SemanticField {
    name: string;
    description: string;
    formula: string; // Dynamic formula evaluated via Formula Engine
  }

  export const FinancialSemanticModel: SemanticField[] = [
    {
      name: 'GrossRevenue',
      description: 'Total revenue before deductions',
      formula: 'Sum(Invoices.totalAmount)'
    },
    {
      name: 'NetRevenue',
      description: 'Total revenue minus adjustments',
      formula: 'GrossRevenue - Sum(CreditNotes.amount)'
    }
  ];
  ```

### 3.4 SRE Circuit Breaker
Implements network resilience filters on external HTTP API integrations.
- **Path:** `platform/operations/reliability/circuit-breaker.ts`
- **TypeScript Implementation:**
  ```typescript
  export class CircuitBreaker {
    private state: 'CLOSED' | 'OPEN' | 'HALF-OPEN' = 'CLOSED';
    private failureCount = 0;
    private lastFailureTime?: number;

    constructor(
      private readonly threshold: number = 5,
      private readonly timeoutMs: number = 30000
    ) {}

    public async execute<T>(action: () => Promise<T>): Promise<T> {
      if (this.state === 'OPEN') {
        if (Date.now() - (this.lastFailureTime || 0) > this.timeoutMs) {
          this.state = 'HALF-OPEN';
        } else {
          throw new Error('Circuit Breaker is OPEN. Request rejected.');
        }
      }

      try {
        const result = await action();
        if (this.state === 'HALF-OPEN') {
          this.state = 'CLOSED';
          this.failureCount = 0;
        }
        return result;
      } catch (error) {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.threshold) {
          this.state = 'OPEN';
        }
        throw error;
      }
    }
  }
  ```

---

1. **Phase 1.1 & 1.2 (Completed):** Concurrency-Safe Numbering Engine, Audit Logging.
2. **Phase 1.5 (Completed):** Command Pipeline (CQRS), Idempotency Interceptor, Permissions Security Guard, Advisory Locks.
3. **Phase 2 (Completed):** Dynamic SQL RLS Schema Isolation & Supabase deploy, Projection & Replay Engine, monthly P&L projections, and OLAP Warehouse exports.
4. **Phase 3 (Completed):** Reliability SRE proxies (Circuit Breakers, Rate Limiters), Multi-channel notifications (email, SMS, slack, teams), and Background Job queues.
5. **Phase 4 (Completed):** External systems Connector & Integration Adapter Framework (SAP, Procore, Dynamics) and Auto-Generated TypeScript Client SDK helper engine.
6. **Phase 5 (Completed):** AMC & Service Module (decoupled).
7. **Phase 6 (Completed):** Builder Platform dynamic forms, entity schema registry, approval matrix DSL, and BPMN workflow orchestrator.
8. **Phase 6.5 (Completed):** Next-Gen Intelligence: digital twin context engine, process mining bottleneck discovery, trend-based cashflow forecasts, AI prompt/tool/agent registries, safety guardrails, and MCP server.
9. **Next Task (Phase 7):** Business Module Depth (CRM, Tendering, Estimating, Subcontracts, Inventory, HR, Fleet, Assets).


# Implementation Plan — Enterprise AI Operating Platform & Control Center (`/admin/ai`)

This plan establishes the architecture and phased rollout for the **AURA OS Enterprise AI Control Center**, elevating AURA OS into a full-fledged **Enterprise Agent Operating Platform** (matching Microsoft Dynamics Copilot Studio and Salesforce Agentforce).

---

## 🏛️ Comprehensive Architecture Blueprint

```
                                  AURA OS INTELLIGENCE PLATFORM
                                            (/admin/ai)
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  📊 Dashboard       │  🤖 Agent Manifests  │  ⚡ Skill Packages   │  🔄 Workflows & Planner     │
│  💳 Costs & Routing │  🧠 Memory Framework │  🔌 Connectors       │  🔍 Activity & Inspector    │
│  🛡️ Guardrails      │  ⚖️ Policy Engine    │  🏛️ Governance       │  🏪 Agent Marketplace       │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Core Architectural Foundations (Included in MVP Base)

1. **Agent Manifest (`AgentManifest`):** A unified, declarative JSON/YAML specification defining an agent (id, role, version, skills, capabilities, memory access, model policy, guardrails, workflows).
2. **Agent SDK (`defineAgent`, `defineSkill`, `defineWorkflow`):** Developer-friendly abstractions for instantiating agents, skills, and pipelines cleanly without boilerplate.
3. **Enterprise Policy Engine (`PolicyEngineService`):** Decouples business governance rules (*No PO > 100k AED without Approval*, *Delete Customer Forbidden*) from individual agent code.
4. **Knowledge Provider Seam (`KnowledgeProvider`):** Pluggable provider interface for RAG context (`pgvector`, `Documents`, `Contracts`, `Specifications`, `ERP`).
5. **Connector Framework Seam (`ConnectorFrameworkService`):** Standardized interface for external ecosystem integration (`Slack`, `Teams`, `SAP`, `SharePoint`, `Google Drive`).

---

## 🚀 4-Phase Rollout Roadmap

```
PHASE 1: Governance & Observability MVP  ──►  PHASE 2: Capabilities & Memory Engine
   • Agent Health & Metrics Engine               • Rich Skill Packages
   • Business ROI & Cost Analytics               • Capability-based Agent RBAC
   • 4-Part Explainability Engine                • Standalone Model Router
   • Activity Timeline & Inspector               • Multi-Tier Memory Framework
   • Agent Manifest & SDK Foundation             • Enterprise Policy Engine & Knowledge Seam
               │                                             │
               ▼                                             ▼
PHASE 3: Collaboration & Execution Engine ──► PHASE 4: Platform, Marketplace & Plugins
   • Declarative Workflow Engine & DAG           • Agent Marketplace Lifecycle
   • Multi-Agent Collaboration                   • Digital Twin Monitor Dashboard
   • Execution State Machine & Resumption        • Connector Framework & Plugin SDK
```

---

## Proposed Changes (Phase 1 Focus)

### 1. Intelligence Platform Infrastructure (`intelligence/src`)

#### [NEW] [agent-manifest.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/agent-manifest.ts) & [agent-sdk.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/agent-sdk.ts)
- **Agent Manifest:** Standard schema interface (`AgentManifest`) for declarative agent definitions.
- **Agent SDK:** Developer functions (`defineAgent`, `defineSkill`, `defineWorkflow`) to construct platform assets cleanly.

#### [NEW] [agent-metrics.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/agent-metrics.service.ts)
- **Agent Health Engine:** Calculates automated health status (`Healthy`, `Degraded`, `Critical`, `Offline`) based on error rate %, average latency (ms), task completion %, suggestion acceptance %, and retries.
- **Business ROI & Cost Analytics:** Tracks LLM spend indexed by Agent, Workflow, ERP Module (`procurement`, `finance`, etc.), and Project.

#### [NEW] [agent-tracer.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/agent-tracer.service.ts)
- **Activity Timeline & 4-Part Explainability Engine:** Tracks execution trace steps (`Trigger` $\rightarrow$ `Memory` $\rightarrow$ `Tools` $\rightarrow$ `Proposal`).
- Attaches 4-part explainability cards to every autonomy proposal:
  1. **Decision Summary:** Summary of what the agent decided.
  2. **Evidence:** Supporting document URIs, DB records, or event logs.
  3. **Tools Used:** Exact tool invocations with arguments and output data.
  4. **Confidence & Risk:** Confidence score % and identified risk factors.

#### [NEW] [policy-engine.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/policy-engine.service.ts)
- **Enterprise Policy Engine:** Evaluates business governance rules independently of agent logic.

#### [NEW] [knowledge-provider.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/knowledge-provider.service.ts) & [connector-framework.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/connector-framework.service.ts)
- Pluggable provider seams for multi-source RAG context and external ecosystem integrations.

---

### 2. Platform Admin APIs & Web Control Center (`apps/api` & `apps/web`)

#### [MODIFY] [platform-admin.controller.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/admin/platform-admin.controller.ts)
- Expose Phase 1 observability endpoints (`GET /admin/platform/ai` extended with metrics, health, cost analytics, activity logs, and 4-part proposal explainability metadata).

#### [MODIFY] [apps/web/app/admin/ai/page.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/admin/ai/page.tsx) & [apps/web/components/ai-admin-client.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/components/ai-admin-client.tsx)
- Render the 7-section **Enterprise AI Control Center** interface:
  - **📊 Health & Dashboard:** Live health scores, error rates, average latency, ERP business unit costs.
  - **🤖 Agents & Manifests:** Manifest viewer, capability RBAC matrix, dynamic model policies.
  - **⚡ Skills & Workflows:** Rich skill entity manager & visual step builder for declarative workflows.
  - **💳 Cost & Model Router:** Business ROI analytics & task-based smart model routing rules.
  - **🧠 Memory & Digital Twin:** Multi-tier memory inspector and live `aura_digital_twin_snapshots`.
  - **🔍 Activity & Explainability:** Step-by-step timeline, live event stream, and 4-part explainability inspector.
  - **🛡️ Governance & Safety:** Policy engine rules, guardrails, and autonomy thresholds.

---

## Verification Plan

### Automated Tests
- Run full unit/integration test suite:
  ```bash
  pnpm turbo test --filter=@aura/intelligence
  ```

### Build & Compilation Check
- Run workspace build verification:
  ```bash
  pnpm turbo build --filter=@aura/intelligence --filter=@aura/api
  ```

### Manual Verification
- Launch web application and test `/admin/ai` Control Center tabs, agent manifests, health calculations, cost analytics, and 4-part explainability cards.

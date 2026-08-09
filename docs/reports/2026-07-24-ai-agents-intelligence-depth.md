# AURA OS — Deep Analysis Report: AI, Agents & Intelligence Infrastructure

**Date:** July 24, 2026  
**System:** AURA OS (Tier-1 Modular Monolith ERP Operating System)  
**Scope:** AI Substrate, Agent Registries, Autonomy Engine, Vector Store, Guardrails, and Model Context Protocol (MCP)

---

## Executive Summary

**Answer to User Question:** **YES, you definitely have AI agents and a complete Intelligence platform built into AURA OS.**

AURA OS is engineered specifically as a 5-layer system where **Layer 3 (Intelligence)** and **Layer 4 (Optimization)** form an autonomous, event-driven intelligence substrate. The system provides an end-to-end framework for defining, registering, running, and governing AI agents safely.

> [!IMPORTANT]
> **Core Architectural Law:** The Intelligence layer reads business state (events and read-models) and **proposes actions**—it *never* directly mutates or writes core module database tables. All agent actions flow through the **Autonomy Safety Engine**.

---

## 🏛️ Architecture Breakdown (5-Layer Modular Monolith)

| Layer | Name | Path | Role & Agent Capability |
| :--- | :--- | :--- | :--- |
| **L1** | **Experience** | `apps/web` | Executive AI Dock, Intelligence Console (`/admin/intelligence`), AI Admin (`/admin/ai`), Briefing UI (`/intelligence`). |
| **L2** | **Intelligence** | `intelligence/src` | AI Platform (Agent/Tool/Prompt Registries), ReAct Execution Engine, Autonomy Safety Queue, MCP Protocol Server, Vector Search RAG. |
| **L3** | **Optimization** | `intelligence/src` | IEC 4-layer pricing calibrator, CBS cost roll-ups, cashflow forecasting, process mining bottleneck discovery. |
| **L4** | **Modules** | `modules/*` | 16 Bounded Contexts (Procurement, Finance, Projects, HR, etc.) owning schemas & emitting outbox events. |
| **L5** | **Kernel** | `core/` | Event Store, Outbox, Tenancy, Auth/RBAC, Audit Logging, and the **AI Seam Provider** (`AiService`). |

---

## 🔍 Detailed Component Audit

### 1. Kernel AI Provider Seam (`@aura/core`)
* **Source:** [`core/src/ai/ai.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/core/src/ai/ai.service.ts)
* **Functionality:** 
  - Abstract AI provider seam so consumers (`IntelligenceModule`, controllers) never talk directly to vendor SDKs.
  - Switches automatically between **Claude** (`ANTHROPIC_API_KEY`) and deterministic **Local Fallback Mode** (ensures API always boots offline).
  - Neural vs. Lexical fallback seam for text embeddings (`Embedder`).

### 2. Next-Gen AI Platform (`AiPlatformService`)
* **Source:** [`intelligence/src/ai-platform.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/ai-platform.service.ts)
* **Functionality:**
  - **Prompt Registry:** System prompts & user templates supporting mustache placeholder syntax (`{{variable}}`).
  - **Tool Registry:** Tool definitions with JSON Schema parameter validation and in-process execution handlers.
  - **Agent Registry:** Registers named agents with specific prompts, mapped tool arrays, target LLMs, and max iteration ceilings.
  - **ReAct Execution Runner:** Simulates/executes multi-step reasoning and tool invocation loops (`runAgent`).

### 3. Autonomy Safety Engine (`AutonomyService`)
* **Source:** [`intelligence/src/autonomy.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/autonomy.service.ts)
* **Functionality:** Governs agent output into 4 distinct escalation modes:
  1. `Observe`: Log observations silently for audit and pattern discovery.
  2. `Suggest`: Present recommendations in executive feeds without execution controls.
  3. `Assist`: Present actions with 1-click human confirmation buttons.
  4. `Operate`: Autonomous execution for low-risk actions.
* **Safety Thresholds:**
  - `Operate` mode auto-executes ONLY when proposal value $\le \$10,000$ AND budget variance $\le 5\%$. Otherwise, automatically forced to `Assist` mode.

### 4. Model Context Protocol (MCP) Server (`McpServerService`)
* **Source:** [`intelligence/src/mcp-server.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/mcp-server.service.ts)
* **Functionality:**
  - Implements the open MCP standard (`tools/list`, `resources/list`, `tools/call`, `resources/read`).
  - Enables external agent frameworks (Claude Desktop, Cursor, LangChain, AutoGen, CrewAI) to safely query AURA OS resources and invoke registered tools.

### 5. Vector Store & RAG Engine (`VectorStoreService`)
* **Source:** [`intelligence/src/vector-store.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/vector-store.service.ts)
* **Functionality:**
  - Semantic similarity RAG search over postgres (`pgvector` with 1536-dimensional embeddings).
  - Used for contract clause retrieval, market item matching, and context-aware enterprise search.

### 6. AI Safety & Guardrails (`AiGuardrailsService`)
* **Source:** [`intelligence/src/ai-guardrails.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/ai-guardrails.service.ts)
* **Functionality:**
  - Enforces blocked keywords, token limits, topic filters, and PII masking across prompts and completions.

---

## 📊 Database Schema Inventory (`public.aura_*`)

The database contains dedicated PostgreSQL tables backing the AI & Intelligence infrastructure (migrations [`0019`](file:///c:/Users/Jeet_intech/Desktop/aura-os/infrastructure/migrations/0019_intelligence_pricing_autonomy.sql) & [`0040`](file:///c:/Users/Jeet_intech/Desktop/aura-os/infrastructure/migrations/0040_intelligence_platform.sql)):

```mermaid
erDiagram
    aura_ai_agents ||--o{ aura_ai_prompts : "references prompt_key"
    aura_ai_agents ||--o{ aura_ai_tools : "binds tool_keys"
    aura_autonomy_proposals }|--|| aura_ai_agents : "emitted by"
    aura_vector_store ||--o{ aura_digital_twin_snapshots : "indexes"

    aura_ai_prompts {
        uuid id
        string prompt_key
        string system_prompt
        string user_template
        integer version
    }
    aura_ai_tools {
        uuid id
        string tool_key
        jsonb input_schema
        jsonb output_schema
        string endpoint
    }
    aura_ai_agents {
        uuid id
        string agent_key
        string prompt_key
        string[] tool_keys
        string model
        integer max_iterations
        boolean enabled
    }
    aura_autonomy_proposals {
        uuid id
        string category
        string severity
        string mode
        numeric value_amount
        string status
    }
    aura_vector_store {
        uuid id
        string content
        vector embedding
        jsonb metadata
    }
```

---

## ⚡ Active vs. Extensible Agent Matrix

| Feature / Agent Capability | Status | Wired In Codebase? | Implementation Reference |
| :--- | :---: | :---: | :--- |
| **Kernel AI Seam (`AiService`)** | ✅ Ready | Yes | [`core/src/ai/ai.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/core/src/ai/ai.service.ts) |
| **Executive Copilot Agent** | ✅ Active | Yes | [`apps/api/src/intelligence/intelligence.controller.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/intelligence/intelligence.controller.ts#L144-L193) |
| **IEC Pricing Calibrator Engine** | ✅ Active | Yes | [`intelligence/src/pricing.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/pricing.service.ts) |
| **Autonomy Proposal Engine** | ✅ Active | Yes | [`intelligence/src/autonomy.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/autonomy.service.ts) |
| **MCP Server Protocol** | ✅ Ready | Yes | [`intelligence/src/mcp-server.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/mcp-server.service.ts) |
| **pgvector RAG Store** | ✅ Ready | Yes | [`intelligence/src/vector-store.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/vector-store.service.ts) |
| **ReAct Agent Runner Framework** | ✅ Ready | Yes | [`intelligence/src/ai-platform.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/ai-platform.service.ts#L116) |
| **Domain-Specific Agents (CFO, Procurement, HSE)** | 🛠️ Extensible | Registry Ready | Can be instantiated using `AiPlatformService.registerAgent()` |

---

## 🛠️ Step-by-Step Guide: How to Add a New Custom Agent

To register a new autonomous agent (e.g., **`InvoiceMatchingAgent`**):

1. **Register Tools** using `AiPlatformService.registerTool`:
   ```typescript
   aiPlatform.registerTool({
     key: 'fetch_pending_invoices',
     label: 'Fetch Invoices',
     description: 'Retrieves AP invoices pending 3-way matching',
     inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
     outputSchema: { type: 'object' },
     handler: async (args) => financeService.listPendingInvoices(args.limit),
   });
   ```

2. **Register System Prompt** using `AiPlatformService.registerPrompt`:
   ```typescript
   aiPlatform.registerPrompt({
     key: 'invoice_auditor_v1',
     label: 'Invoice Auditor Prompt',
     systemPrompt: 'You are an automated ERP accounting auditor verifying 3-way invoice matching against POs and GRNs.',
     userTemplate: 'Analyze invoice {{invoiceId}} against PO {{poId}}.',
     modelHint: 'claude-3-5-sonnet',
     version: 1,
     tags: ['finance', 'audit'],
   });
   ```

3. **Register Agent** using `AiPlatformService.registerAgent`:
   ```typescript
   aiPlatform.registerAgent({
     key: 'invoice_matching_agent',
     label: 'Invoice 3-Way Matching Agent',
     description: 'Audits supplier invoices against purchase orders and goods receipt notes.',
     promptKey: 'invoice_auditor_v1',
     toolKeys: ['fetch_pending_invoices', 'compare_po_grn'],
     model: 'claude-3-5-sonnet',
     maxIterations: 5,
     enabled: true,
   });
   ```

4. **Emit Action Proposals** using `AutonomyService.propose`:
   ```typescript
   await autonomyService.propose(tenantId, {
     title: 'Approve Invoice INV-9042 (Variance 0.4%)',
     category: 'approval',
     severity: 'info',
     mode: 'operate', // Auto-executes if value <= $10,000
     targetModule: 'finance',
     targetAction: 'approve_invoice',
     targetId: invoiceId,
     valueAmount: 4200,
     variancePercent: 0.4,
   });
   ```

---

## 🎯 Conclusion

AURA OS has a **state-of-the-art AI, Agent, and Autonomy substrate**. The infrastructure for hosting, running, governing, and embedding agents is **100% complete and operational**. You can immediately add custom domain agents for any of the 16 ERP modules.

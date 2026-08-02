# AURA OS — Agent Developer SDK & Marketplace Publishing Guide

Welcome to the **AURA OS Agent SDK & Marketplace Publishing Guide**. This guide provides enterprise developers and independent software vendors (ISVs) with the tools and standards required to build, test, and publish autonomous AI agents, skills, and multi-agent workflows into the **AURA OS Agent Marketplace**.

---

## 🏛️ Platform Architecture Seam

```
┌─────────────────────────────────────────────────────────────┐
│                 AURA OS AGENT MARKETPLACE                   │
│          Browse · 1-Click Install · Rating · Metering       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      DEVELOPER SDK                          │
│   defineAgent()   ·   defineSkill()   ·   defineWorkflow()  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   7-STEP AGENT RUNTIME                      │
│ Context → Memory → Tools → Policy → LLM → Proposal → Trace  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Step 1: Defining an Agent using SDK

Agents in AURA OS are declarative manifests created using `defineAgent()`. They define prompt key bindings, allowed tool keys, capability RBAC scopes, and autonomy modes.

```typescript
import { defineAgent } from '@aura/intelligence';

export const warehouseOptimizerAgent = defineAgent({
  agentKey: 'warehouse_optimizer',
  label: 'Warehouse & Inventory Optimizer',
  description: 'Monitors minimum reorder thresholds, predicts stockouts, and generates automated purchase requisitions.',
  promptKey: 'prompts.warehouse.reorder',
  toolKeys: ['inventory.stock.read', 'procurement.pr.create'],
  grantedCapabilities: ['inventory.stock.read', 'procurement.pr.create'],
  model: 'claude-3-5-sonnet',
  maxIterations: 5,
  autonomyMode: 'assist',
});
```

---

## ⚡ Step 2: Defining a Modular Skill Package

Skill packages bundle prompts, input/output JSON schemas, required capabilities, and unit tests into a self-contained, versioned module.

```typescript
import { defineSkill } from '@aura/intelligence';

export const boqAnalysisSkill = defineSkill({
  skillKey: 'analyze_boq_structure',
  name: 'BOQ Structural & Cost Analyzer',
  version: '1.2.0',
  description: 'Parses raw BOQ line items and categorizes into CSI MasterFormat divisions.',
  promptKey: 'prompts.tendering.boq_parse',
  tools: ['tendering.boq.read'],
  requiredCapabilities: ['tendering.boq.read'],
  inputSchema: {
    type: 'object',
    properties: {
      rawText: { type: 'string' },
      currency: { type: 'string', default: 'AED' },
    },
    required: ['rawText'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      lineItemsCount: { type: 'number' },
      totalEstimatedCost: { type: 'number' },
    },
  },
});
```

---

## 🔄 Step 3: Defining a Multi-Agent Workflow

Workflows orchestrate multiple agents sequentially or in parallel using state machines and Human Approval Gates.

```typescript
import { defineWorkflow } from '@aura/intelligence';

export const tenderToQuoteWorkflow = defineWorkflow({
  id: 'wf-tender-to-quote-v1',
  name: 'Tender-to-Quote Enterprise Pipeline',
  description: 'Automates sales radar signal detection, BOQ parsing, cost estimation, and commercial quote generation.',
  steps: [
    { id: 'step-1', agentId: 'sales_radar', action: 'detect_tender_signal' },
    { id: 'step-2', agentId: 'tender_analyzer', action: 'parse_boq_specification' },
    { id: 'step-3', agentId: 'estimation_assistant', action: 'calculate_wbs_buildup' },
    { id: 'step-4', agentId: 'quotation_agent', action: 'generate_client_proposal' },
  ],
  humanGate: {
    stepId: 'step-4',
    condition: 'value_exceeds_threshold',
    thresholdAmountAed: 500000,
    requiredRole: 'usr-chief-estimator',
  },
});
```

---

## 📦 Step 4: Marketplace Package Structure

To publish your agent to the AURA OS Marketplace, package your files according to the following directory structure:

```
my-agent-package/
├── manifest.json            # Package metadata & pricing
├── agent.ts                 # Agent definition
├── skills/
│   └── analyze-boq.ts       # Modular skills
├── prompts/
│   └── system-prompt.txt    # System prompts
└── README.md                # Documentation & Usage
```

### `manifest.json` Example:

```json
{
  "packageId": "pkg-contract-negotiator-v1",
  "name": "📜 Contract Terms & Risk Negotiator",
  "publisher": "AURA Enterprise Labs",
  "version": "1.0.0",
  "category": "contracts",
  "monthlyPriceUsd": 49,
  "description": "Scans subcontracts for FIDIC liabilities and proposes liquidated damage clauses.",
  "requiredCapabilities": ["contracts.read", "contracts.write"],
  "agentManifests": ["contract_negotiator"]
}
```

---

## 🛡️ Step 5: Safety & Governance Checklist

Before submitting an Agent Package for Marketplace verification, ensure it satisfies the following security standards:

- ✅ **Capability RBAC:** Agent specifies minimum required capabilities in `grantedCapabilities`.
- ✅ **Decoupled Governance:** Policy checks in `PolicyEngineService` must be respected.
- ✅ **Human Approval Gates:** High-risk or high-value transactions (> $500,000 AED) MUST require human confirmation.
- ✅ **Zero Direct DB Mutations:** Agent MUST emit autonomy proposals or use official NestJS domain module APIs — NEVER mutate database tables directly.
- ✅ **Auditable Explainability:** Proposals MUST include evidence sources, confidence scores, and risk classifications.

---

*Document registered in `docs/guides/AGENT-SDK-AND-MARKETPLACE-PUBLISHING.md`.*

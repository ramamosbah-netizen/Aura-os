# Implementation Plan — Admin Center AI & Agent Management Suite

This plan upgrades the AURA OS Admin Center (`/admin/ai`) to provide a comprehensive management interface for all AI Agents, Prompts, Tools, Guardrails, and Autonomy Policies directly from App Settings.

## User Review Required

> [!IMPORTANT]
> **Key Architecture Decision:** Agents read-and-propose actions via the Autonomy Engine. Managing agents in the Admin Center will allow administrators to enable/disable agents, switch their target models (e.g., Claude 3.5 Sonnet, Gemini 2.0 Flash, GPT-4o), edit max execution steps, and configure global safety thresholds (e.g., auto-execution monetary value cap).

---

## Proposed Changes

### 1. Domain Agent Registration (`intelligence/src`)

#### [MODIFY] [ai-platform.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/ai-platform.service.ts)
- Add seed initialization for default domain-specific ERP agents upon service boot:
  - `procurement_auditor`: Audits purchase orders and 3-way invoice mismatches.
  - `cost_variance_agent`: Monitors project WBS/CBS budget variances and flags cost overruns.
  - `estimation_assistant`: Calibrates tender rate buildups against historical market data (IEC).
  - `site_safety_supervisor`: Scans daily site logs and HSE reports for high-risk safety hazards.
- Add methods to update agent status (`enable/disable`), switch agent target model, and adjust max iterations.

#### [MODIFY] [autonomy.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/autonomy.service.ts)
- Support dynamic configuration for safety thresholds (`OPERATE_VALUE_LIMIT` and `OPERATE_VARIANCE_LIMIT`) driven by tenant app settings.

---

### 2. Platform Admin APIs (`apps/api/src/admin`)

#### [MODIFY] [platform-admin.controller.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/admin/platform-admin.controller.ts)
- Extend `GET /api/admin/platform/ai` endpoint to return:
  - Active AI provider status
  - Array of registered Agents (`key`, `label`, `description`, `promptKey`, `toolKeys`, `model`, `maxIterations`, `enabled`)
  - Array of registered Prompts & Tools
  - Guardrail rules status
  - Autonomy Queue counts & configured safety thresholds (`valueLimit`, `varianceLimit`).
- Add management endpoints:
  - `POST /api/admin/platform/ai/agents/toggle`: Enable/disable an agent.
  - `POST /api/admin/platform/ai/agents/update`: Update an agent's assigned model or max iterations.
  - `POST /api/admin/platform/ai/autonomy/thresholds`: Update the global autonomy safety limit ($ value and % variance).

---

### 3. Next.js Web Admin Console (`apps/web`)

#### [MODIFY] [apps/web/app/admin/ai/page.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/admin/ai/page.tsx)
- Pass complete AI Agent list, prompt templates, tools, and autonomy policy configuration to `AiAdminClient`.

#### [MODIFY] [apps/web/components/ai-admin-client.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/components/ai-admin-client.tsx)
- Transform the UI into a tabbed/sectioned **AI & Agent Control Hub**:
  - **Tab 1: AI Agents Manager:** Interactive cards for each registered agent with enable/disable toggles, model selector dropdown, max iteration badges, and bound tools list.
  - **Tab 2: Guardrails & Safety:** Interactive toggles for blocked keywords, token limits, and PII masking.
  - **Tab 3: Autonomy Policy & Thresholds:** Configure the max monetary value ($) and budget variance (%) for auto-execution (`Operate` mode).
  - **Tab 4: Tool & Prompt Registry:** Inspect registered system prompts and available tool capabilities.

#### [MODIFY] [apps/web/app/api/admin/platform/ai/...](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/api/admin/platform/ai)
- Update/add proxy BFF routes for agent toggles, agent updates, and autonomy threshold adjustments.

---

## Verification Plan

### Automated Tests
- Run unit/integration tests for AI platform service and platform admin controller:
  ```bash
  pnpm turbo test --filter=@aura/intelligence
  ```

### Manual Verification
- Launch API & Web apps (`pnpm --filter @aura/api start:dev` and `pnpm --filter @aura/web dev`).
- Navigate to `/admin/ai` in the browser.
- Verify that all seed ERP agents (Procurement Auditor, Cost Variance Agent, Estimation Assistant, etc.) appear in the Agent Control Hub.
- Test toggling agents on/off, changing target LLM models, and saving autonomy safety thresholds.

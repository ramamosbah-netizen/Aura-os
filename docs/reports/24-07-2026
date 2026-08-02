# Walkthrough — Admin Center AI & Agent Management Suite

We have updated AURA OS with a comprehensive **AI & Agent Management Suite** inside the Admin Center ([`/admin/ai`](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/admin/ai/page.tsx)), enabling administrators to manage AI Agents, configure autonomy safety ceilings, toggle guardrail rules, and inspect system prompts & tools.

---

## 🛠️ Summary of Changes

### 1. Seed Domain ERP Agents Registered (`intelligence/src`)
* **[`ai-platform.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/ai-platform.service.ts):** Added automatic seeding upon platform boot for 4 specialized domain agents:
  1. **Procurement Auditor Agent:** Audits purchase orders and 3-way invoice matching anomalies.
  2. **Cost Variance & Risk Agent:** Monitors project WBS/CBS budget variances and flags cost overruns.
  3. **IEC Rate Buildup Estimator:** Calibrates tender rate buildups against historical market data.
  4. **Site Safety Supervisor Agent:** Scans daily site reports and HSE logs for high-risk hazards.
* Added `toggleAgent()`, `updateAgent()`, and `listPrompts()` methods to `AiPlatformService`.
* **[`autonomy.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/autonomy.service.ts):** Added dynamic getters/setters (`getThresholds()`, `setThresholds()`) for global auto-execution monetary value limits ($) and budget variance percentage ceilings.

---

### 2. Platform Admin APIs (`apps/api/src/admin`)
* **[`platform-admin.controller.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/admin/platform-admin.controller.ts):**
  - Updated `GET /api/admin/platform/ai` to return active agents, prompt templates, tools list, guardrail rules, and autonomy thresholds.
  - Added `POST /api/admin/platform/ai/agents/toggle`: Toggle an agent's on/off status.
  - Added `POST /api/admin/platform/ai/agents/update`: Update an agent's model (`claude-3-5-sonnet`, `gemini-2.0-flash`, `gpt-4o`) or max iteration steps.
  - Added `POST /api/admin/platform/ai/autonomy/thresholds`: Update the global autonomy safety thresholds.

---

### 3. Web BFF & Next.js Admin Center UI (`apps/web`)
* **BFF Proxy Endpoints Added:**
  - [`/api/admin/platform/ai/agents/toggle`](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/api/admin/platform/ai/agents/toggle/route.ts)
  - [`/api/admin/platform/ai/agents/update`](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/api/admin/platform/ai/agents/update/route.ts)
  - [`/api/admin/platform/ai/autonomy/thresholds`](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/api/admin/platform/ai/autonomy/thresholds/route.ts)
* **[`apps/web/app/admin/ai/page.tsx`](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/admin/ai/page.tsx):** Enhanced with KPI cards displaying **Active Agents** and **Autonomy Safety Ceiling**.
* **[`apps/web/components/ai-admin-client.tsx`](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/components/ai-admin-client.tsx):** Created a tabbed control center:
  - **🤖 AI Agents Tab:** View agent cards, toggle enable/disable state, switch LLM models dynamically via dropdown, view max steps, and inspect bound tools.
  - **🛡️ Guardrails Tab:** Toggle safety rules (blocked keywords, token caps, PII masking).
  - **⚡ Autonomy Policy Tab:** Form to configure the dollar ceiling ($) and budget variance limit (%) for auto-execution (`Operate` mode).
  - **📚 Prompts & Tools Tab:** Registry inspector for system prompts and tool schemas.

---

## 🎨 Interface Structure (`/admin/ai`)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AI & AGENT ADMINISTRATION                       │
│  Provider: Claude    AI Agents: 4/4    Guardrails: 4/4    Ceiling: $10,000│
└────────────────────────────────────────────────────────────────────────┘
  [🤖 AI Agents (4)]  [🛡️ Guardrails (4)]  [⚡ Autonomy Policy]  [📚 Prompts & Tools]
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────┐    ┌──────────────────────────┐           │
│ │ Procurement Auditor Agent│    │ Cost Variance & Risk     │           │
│ │ [Toggle ON]              │    │ [Toggle ON]              │           │
│ │ Model: [Claude 3.5 ▼]    │    │ Model: [Claude 3.5 ▼]    │           │
│ │ Tools: 🔧 fetch_po_data  │    │ Tools: 🔧 query_wbs      │           │
│ └──────────────────────────┘    └──────────────────────────┘           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Verification Results

- Packages `@aura/intelligence`, `@aura/core`, and `@aura/api` compiled successfully.
- All new REST endpoints (`GET /admin/platform/ai`, `POST agents/toggle`, `POST agents/update`, `POST autonomy/thresholds`) are guarded with `@Permissions('admin.ai.manage')`.

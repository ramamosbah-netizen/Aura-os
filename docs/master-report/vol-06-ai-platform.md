# Volume 6 — AI Platform

[← Master index](README.md)

AURA's AI layer is **architecture-first**: one provider seam in the kernel, a dedicated
Intelligence package above the modules, and guardrails between AI output and business writes.
This volume documents what exists (verified in `core/src/ai/` and `intelligence/src/`), what
degrades gracefully, and what is designed but unbuilt.

---

## 1. Providers

**Port:** `shared/src/ai/ai-provider.ts` — `AiProvider.complete(req)` / `embed(text)`.
Every consumer (Intelligence, modules, web AI dock, form-engine AI plugins) calls this one
interface; no vendor SDK appears outside `core/src/ai/`.

| Provider | File | Notes |
|---|---|---|
| **Claude** | `core/src/ai/claude-provider.ts` | Messages API; default model `claude-opus-4-8`; sampling-locked-model guard (Opus 4.7+/Fable family rejects temperature params — enforced in `buildClaudeMessageParams`, unit-tested) |
| **Local fallback** | `core/src/ai/local-provider.ts` | Deterministic heuristics — every AI feature functions without an API key (degraded, never broken). This is a deliberate product property: demos and tests never depend on external calls |
| OpenAI / Gemini / Azure | — | [Planned] — the port was designed for them; each is one adapter file |

`GET /api/v1/ai/provider` reports the active provider; `POST /api/v1/ai/complete` is the
generic completion endpoint the web BFF (`/api/ai`) fronts.

## 2. Prompt Library

Prompts live beside their consumers today (form auto-fill and review prompts in the form-engine
plugins; insight/briefing prompts in `intelligence/src/{insight.service, briefing}.ts`).
A centralized, versioned prompt registry with per-tenant overrides is **[Planned]** — the
natural home is the kernel builder (it is metadata). Convention already enforced: prompts
demand **structured JSON output** and parse defensively.

## 3. RAG & Embeddings

- **Embedder:** `core/src/ai/embedder.ts` — lexical embedding implementation (tested), behind
  `AiProvider.embed()` so a model-based embedder is a drop-in.
- **Vector store:** `intelligence/src/vector-store.service.ts` (tested) — store + similarity
  search over embedded business content.
- **Context engine:** `intelligence/src/ai-context.engine.ts` — assembles module context
  (records, events, projections) into prompts; the AI dock's page-aware context
  (`page` in ChatDto) rides this.
- RAG over the DMS corpus (documents, contracts) is the designed next step [Planned]: DMS
  full-text extraction feeds the vector store.

## 4. Guardrails

`intelligence/src/ai-guardrails.service.ts`: AI never writes business data directly. The
**autonomy loop** (`autonomy.service.ts`) generates *proposals* (persisted, migration 0019)
that a human executes or rejects — `POST /intelligence/proposals/:id/execute|reject`. Output
constraints: JSON-schema-shaped responses, allow-listed action types, tenant-scoped context.

## 5. OCR · Vision · Speech

| Capability | State |
|---|---|
| Document text extraction (typed text) | ✅ — AI auto-fill accepts pasted/uploaded text today |
| OCR of scanned PDFs/images | **[Gap]** — designed slot: a vision-capable provider call behind the same seam; the auto-fill pipeline is already shaped for it (text in → fields out) |
| Vision (photos: site progress, defect detection) | [Planned — Volume 24] |
| Speech (voice capture for site diaries) | [Planned — Volume 24 Voice ERP] |

## 6. Recommendations

Shipped: pricing calibrations (below). Designed [Planned], each an insight-service extension
with existing data: preferred suppliers (PO history), historical values on forms (same-entity
priors), missing-field nudges (form analytics), related records (event graph walk).

## 7. Assistant

The **AI dock** — platform-wide chat (`POST /intelligence/chat`, 144-line controller route) with
page context: the assistant knows which module/record the user is viewing (`ai-context.engine`).
Form-level assistance is delivered by the two form plugins (auto-fill, review). Verb execution
("create a supplier") through the palette/workflow bridge is [Planned] (W7 follow-up).

## 8. Risk Analysis

Building blocks live: insight service + pipeline/ledger projections + process mining
(`process-mining.service.ts` — event-stream pattern extraction). Continuous record-level risk
scoring (low margin, missing insurance, expired documents, budget conflict) is **[Planned]**;
the designed surface is a risk chip on record pages + a findings feed into the universal inbox.

## 9. Forecasting & Planning

Data foundations shipped: cash-flow forecast entity (S-curve, peak funding), EVM (CPI/SPI),
pipeline projection, PPM scheduling. Model-driven forecasting (revenue, cash, resource demand)
is [Planned — Volume 24 Predictive ERP].

## 10. Knowledge

`briefing.ts` generates narrative briefings from projections (the "what changed" digest).
A knowledge base with RAG over tenant documents is [Planned] (§3 dependency).

## 11. Agents & MCP

`intelligence/src/mcp-server.service.ts` — AURA exposes itself as an **MCP server**: external
AI agents (Claude Desktop et al.) can call AURA tools. Combined with the autonomy proposal
loop, this is the agent substrate: agents act through governed proposals, not raw writes.
Multi-step internal agents are [Planned — Volume 24].

## 12. Intelligence API surface

11 handlers (`apps/api/src/intelligence`): pipeline · projects · insights (POST) ·
calibrations (GET/trigger) · pricing-sources · proposals (list/create/execute/reject) · chat.

## Maturity verdict

| Layer | Score rationale |
|---|---|
| Provider seam + fallback | ✅ enterprise-grade pattern, tested |
| Guardrails/autonomy | ✅ ahead of most incumbents' bolt-ons |
| Applied features | ◐ pricing, insights, briefings, form fill/review live; risk scoring, recommendations, RAG-over-DMS pending |
| OCR/vision/speech | ❌ not started |
| **Overall** | **55% complete, 6.5/10** — the architecture is the moat; feature depth is the work |

---

*Next: [Volume 7 — Security](vol-07-security.md)*

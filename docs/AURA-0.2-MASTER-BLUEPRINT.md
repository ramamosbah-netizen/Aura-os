# Aura 0.2 — Master Consolidation Blueprint (7 repos → one system)

> Extends [`AURA-0.2-CONSOLIDATION-AUDIT.md`](AURA-0.2-CONSOLIDATION-AUDIT.md) from a 2-repo (AURA ↔ NEW-ERP) merge to the **full 7-project consolidation**. That audit's architecture, layer rules, and AURA↔NEW-ERP decisions still stand — this document does **not** repeat them; it adds the three repos the audit never considered (**Base 44**, **jeet-erp-enterprise**, and the older iterations) and folds them into one build order.
>
> **Date:** 2026-06-23 · **Status:** Draft for sign-off · **No code is written until each phase below is approved.**

---

## 0. Method & confidence

Every claim here was read from disk this session:

- **Scale** measured by file + LOC + page counts (§1).
- **Donor capabilities** confirmed by listing the actual engine/service files (not just their READMEs): Base 44 `src/lib` (22 engines incl. the IEC suite), jeet-erp-enterprise `src/services` (24 services), older iterations' `src/lib` + module dirs.
- **Gaps** confirmed by grepping NEW-ERP `src` for each candidate capability before recommending a harvest, so nothing redundant is proposed.
- Ratings marked `~` are structural inferences to confirm during the merge.

---

## 1. The seven projects, measured

| Project | Files | LOC | Pages | Stack | DB | Verdict |
|---|---:|---:|---:|---|---|---|
| **NEW-ERP** | 628 | **128,877** | 264 | Next 16 · Supabase | 98 SQL migrations (12.1k LOC) | **BASE — system of record** |
| **jeet-erp-full** | 106 | 38,743 | 0 | Vite · Firebase | Firestore | Archive (salvage 1 asset) |
| **Base 44** | 218 | 37,660 | 7 | Vite · React 18 · Supabase | 52 tables (via `.cjs`) | **Donor — pricing intelligence** |
| **jeet-erp** (nested) | 201 | 32,714 | 46 | Next 15 · Supabase · Anthropic | Supabase | Superseded — archive |
| **Aura** | 208 | 22,711 | 48 | Next 15 · Prisma · SQLite | 57 models | **Donor — the brain** (port underway) |
| **jeet-erp-enterprise** | 55 | 16,364 | 7 | Next 15 · Supabase | 50+ tables (1.0k LOC) | **Donor — selective modules** |
| **jeet-erp-v01** | 23 | 12,544 | 0 | Vite · Firebase→Supabase | Firestore/Supabase | Superseded — archive |

**Why NEW-ERP is the base, decisively:** it is ~3.3× the LOC of the next-largest, has the only mature multi-company Postgres schema (98 migrations vs. 2 in enterprise, 0 committed in Base 44), the only built 12-hub themed shell, ~100 services, and 264 pages. Every other repo is a feature donor, not a merge peer.

---

## 2. Target = the audit's 4-layer architecture (unchanged)

```
EXPERIENCE   Next.js App Router · AppShell · 12-hub nav · theme   (NEW-ERP)
CORE         system of record, ACID · ~100 services · Postgres    (NEW-ERP)
EVENT        system_events ledger (+company_id, versioned)        (NEW-ERP store + AURA bus)
INTELLIGENCE read-only on Core/Event; writes only intel_*         (AURA brain + Base 44 learning)
```

**Rule (enforced):** Intelligence may read Core/Event but never writes Core. The only writers of `intel_*` are the event processor and intelligence engines. Base 44's pricing-learning and AURA's agents both land in the Intelligence layer — they *propose*; Core *commits* through normal approval/autonomy gates.

---

## 3. Harvest decisions per donor

### 3.1 AURA — the brain (already in flight; see audit §3–§10)
No change from the existing audit. Port: event bus/observer/replay over `system_events`, AI agents, autonomy (modes/registry/approval-matrix/queue), RAG memory → **pgvector**, knowledge graph, Hermes comms routing, deal-chain lineage (tender→pricing→quote→SalesContract), Today-Brain workspace, 7-criteria bid/no-bid, Claims/HSE/Mobilization. Drop AURA's GL, HR, persona-auth, SQLite, Prisma.

### 3.2 Base 44 — pricing & estimation intelligence (NEW)
NEW-ERP has **no** pricing-learning loop (grep confirmed: no `learningEngine`/IEC/trust-score/reality-gap engine). This is Base 44's unique, defensible asset and it **complements** AURA's *deterministic* pricing engine: AURA prices an item from a rate model; Base 44 *calibrates that rate model from actuals over time*.

| Take (→ Intelligence layer, read-only) | Source file | What it adds |
|---|---|---|
| **IEC suite** L1–L4 | `iecEngine`, `iecPlusEngine`, `iecPlusPlusEngine`, `iecOmegaEngine` | Source-weighting, global health index, reality-gap + trust-decay, truth-equilibrium/anomaly containment |
| **Learning loop** | `learningEngine`, `intelligenceEngine`, `benchmarkLearner`, `predictiveEngine` | Closed-loop: actuals → reality gap → trust score → estimator-bias → proposed rate change |
| **Market pricing** | `marketPricingEngine`, `priceSync` | Volatility-aware reference rates feeding the catalog |
| **Pre-sales scoring** | `presalesEngine` | Tender feasibility/margin pre-screen (reconcile with AURA bid-engine; keep the stronger) |
| **Security-proxy pattern** | `base44Client` (whitelist + payload sanitization + pagination enforcer) | A hardening *pattern* for NEW-ERP's data layer — adopt the idea, not the file |

**Drop** (NEW-ERP already deeper): Base 44's BOQ/Quotation/Project/Procurement/Invoice/Warehouse/Snag/Handover/Warranty tables — all overlap NEW-ERP's mature equivalents. Its construction QA/commissioning depth is worth a **spot-check against** NEW-ERP `/tc` + `/handover` before discarding (one comparison pass), but the schema stays NEW-ERP's.

> Migration note: Base 44 engines are browser-side JS reading Supabase REST. They must be ported to server-side TS reading the `system_events` ledger + `intel_*` tables, behind the same thin repository layer the audit defines for AURA. The math is portable; the data access is not.

### 3.3 jeet-erp-enterprise — selective module harvest (NEW)
Grep confirmed all five below are **absent** from NEW-ERP. Port as Core services (these are records, not intelligence):

| Take | Source service | Why (NEW-ERP gap) |
|---|---|---|
| **Hierarchical CBS** | `costBreakdownStructureService` | NEW-ERP has budget/commitments but no tree-structured cost-breakdown with roll-up variance |
| **Financial guarantees / bonds** | `financialGuaranteesService` | Performance bonds, bank guarantees, expiry tracking — no NEW-ERP equivalent |
| **Client profitability / LTV** | `clientProfitabilityService` | NEW-ERP has *project* profitability, not *client*-level segmentation/LTV |
| **Unified Work-Center** | `workManagementCenterService` | One queue across 8 item types (tasks/approvals/RFQs/submittals/invoices/overdue…) — stronger than the current per-hub views; fits the Workspace hub |
| **Multi-provider AI abstraction** | `aiProviderService` (+ `aiAssistantService`) | NEW-ERP has only `aiFinanceService` on one provider; this gives Claude/OpenAI/Gemini failover — the substrate for the whole Intelligence layer |

**Reconcile, don't blind-copy:** enterprise also has `evmService` (20k), `boqEngineService`, `tenderStateMachine`, `workflowEngineService`. NEW-ERP already has all four. Diff each pair; promote the richer logic, keep NEW-ERP's schema + UI. **Drop** the rest (duplicates).

### 3.4 Older iterations — archive after salvage (NEW)
Spot-checked per the recommended path:

- **jeet-erp-full** — "Gemini" is only a settings label (no real `@google/genai` calls in code). One asset worth keeping: **`VisualTemplateBuilder`** (drag-drop document/template designer, 13k LOC) — evaluate against NEW-ERP's `/admin/forms` + `/admin/templates`; adopt only if genuinely better. `documentProtocols.ts` (22k) is construction doc-control logic — compare with NEW-ERP `documents` hub, likely redundant.
- **jeet-erp (nested)** — earlier Next+Supabase cut, fully superseded by NEW-ERP. No unique asset found.
- **jeet-erp-v01** — earliest; Firebase→Supabase migration scripts only. Nothing to salvage.

**Action:** capture the one template-builder decision, then mark all three archived (move to an `_archive/` folder or leave in place, untouched). They do not enter the build.

---

## 4. Net-new gaps (no donor has these — greenfield, build later)

From the audit §8 plus this pass:

1. **Document Intelligence / OCR** — highest-value gap. NEW-ERP has `offer-extraction-service` + `document-upload-service` (partial); no real OCR/classification. Enterprise/full have doc *management*, not extraction. Build on the new `aiProviderService` substrate.
2. **pgvector** — RAG memory must move off JSON-cosine before scale.
3. **Group consolidation reporting** — cross-company rollups for the holding group.
4. **Real-time event delivery at scale** — Kafka/queue (deferred; the Postgres processor is fine near-term).
5. **Mobile / offline field app** — partial (`offlineQueue` + camera) in NEW-ERP only.

---

## 5. Decisions needed before Phase 1

The audit's 5 open decisions still apply (ORM = supabase-js, object-model = graph overlay, pre-contract canonical = AURA deal-chain, tenant→company, base = NEW-ERP). This blueprint adds three:

6. **Base 44 IEC port scope** — port the **full 4-layer suite** *(recommended — it's coherent)* / only L1–L2 (weighting + health) now, defer L3–L4 (trust-decay/anomaly) / treat as reference and rebuild clean.
7. **Pre-sales scoring owner** — AURA `bid-engine` (7-criteria) canonical and drop Base 44 `presalesEngine` *(recommended)* / keep both as parallel scorers / merge into one.
8. **Visual template builder** — adopt jeet-erp-full's `VisualTemplateBuilder` into `/admin/templates` / keep NEW-ERP's current builder *(recommended unless demo shows it's weaker)* / defer the call.

---

## 6. Build order (extends the audit's 7 phases)

Additive/read-only work first (low risk), schema-merging work last (high risk). **★ = new vs. the original audit.**

| Phase | Goal | Key work | Risk |
|---|---|---|---|
| **0 ✅ done** | Intelligence scaffold | `intel_*` tables, risk/margin/forecast engines, processor, `/intelligence` hub | — |
| **1 — Foundation** | Consolidatable spine | `company_id`+`event_version` on `system_events`; canonical event taxonomy; tenant→company + auth; confirm ORM; **★ stand up `aiProviderService` (multi-provider AI) as the Intelligence substrate** | High |
| **2 — Brain port (read-only)** | AURA in safely | Autonomy (modes/registry/matrix/queue), memory→pgvector, Hermes, agents, observer over the ledger | Medium |
| **3 — Event emission** | Feed the brain | Wire core mutations (PO, invoice, project status, quote, tender, GRN…) to emit to the ledger | Medium |
| **3.5 ★ — Pricing-learning port** | Base 44 IEC in | Port IEC L1–L4 + `learningEngine`/`marketPricingEngine` as read-only Intelligence engines consuming actuals from the ledger; surface proposals through the existing autonomy/approval gate | Medium |
| **4 — Pre-contract merge** | Kill biggest duplicate | Canonical tender/pricing/quote/contract = AURA deal-chain on Postgres; migrate data; resolve pre-sales scorer (decision #7) | High |
| **5 — Domain overlays + enterprise modules** | Layer intelligence on records | AURA project-twin/lifecycle/closure, procurement autopilot, finance margin/reconciliation, risk propagation, VO/claims/HSE; **★ add enterprise CBS, financial-guarantees, client-profitability as Core services; ★ fold Work-Center into Workspace hub** | Medium |
| **6 — Experience** | Surface the brain | Today-Brain + Hermes UI into the shell; consolidate AURA intel routes under the Intelligence hub; **★ pricing-intelligence dashboard (IEC health, trust scores, rate proposals)** | Low |
| **7 — Gaps & hardening** | Production-grade | **★ Document Intelligence (OCR) on the AI substrate**, RLS audit, perf, group-consolidation reporting, adopt `base44Client` hardening pattern | Medium |

---

## 7. Top risks

| Risk | Severity | Mitigation |
|---|---|---|
| Porting AURA + Base 44 engines off their native data layer (Prisma / browser-Supabase) → server supabase-js | High | One thin repository module; port read-only intelligence first (no Core writes) |
| Pre-contract dedup (two live models + data) | High | Pick canonical tables, write one-time reconciliation, freeze one path during cutover |
| Multi-tenancy unification (`tenantId` vs `company_id` + `system_events` has no `company_id`) | High | Define tenant→company hierarchy and backfill *before* any port |
| Two pricing brains (AURA deterministic + Base 44 learning) confusing ownership | Medium | Explicit contract: AURA prices, Base 44 calibrates the rate model, Core commits via gate |
| Enterprise EVM/BOQ/workflow look like upgrades but may regress NEW-ERP | Medium | Diff each pair; promote logic only, never replace schema/UI wholesale |
| Scope creep across 7 repos | Medium | This blueprint is the gate; nothing not listed here gets built |

---

## 8. Immediate next actions (on sign-off)

1. **You decide** items #6–#8 above (and reconfirm the audit's #1–#5 if not already locked).
2. I begin **Phase 1** — the only foundation change that unblocks everything: `company_id`/`event_version` on `system_events`, the event taxonomy, and standing up `aiProviderService`. All additive; nothing existing breaks.
3. Each subsequent phase ships behind a flag and is reviewed before the next starts.

> Per `AGENTS.md`: this Next.js build has breaking changes vs. stock — I'll read the relevant `node_modules/next/dist/docs/` guide before writing any Phase-1 code.

# AURA OS — Audit Part 3 · CUSTOMER / BUSINESS PERSPECTIVE

> Third companion report. Pass 1 = inside-out engineering audit; Pass 2 = measured blueprint/depth addendum; **this pass = outside-in, the way a construction-company owner evaluates it.** Answers: (A) can I run a whole project Lead→Warranty? (B) capacity/scale, (C) real performance + how to measure it, (D) risk register, (E) AI reality check, (F) UX click-analysis, (G) **business coverage = planned vs delivered per module, precisely.**
> Source-verified where measurable; capacity/performance are **modeled and labelled as such** (no running deployment to load-test). No files modified.

---

## A. END-TO-END SCENARIO — "Can I run one project, Lead → Warranty?"

Walking the real contractor lifecycle through the actual system. ✅ supported · ◐ partial/manual · ❌ absent.

| # | Stage | In AURA today | Verdict |
|---|---|---|---|
| 1 | Marketing **Lead** | CRM lead create/convert | ✅ |
| 2 | **Opportunity** / pipeline | CRM opportunity | ✅ |
| 3 | **Quotation** to client | CRM quotation (line items, VAT, send/accept) | ✅ |
| 4 | **Tender / Estimate** | Tendering + BOQ | ◐ (no estimate cost build-up, no scoring) |
| 5 | **Award → Contract** | Contracts module | ◐ **manual re-entry** — no Tender→Contract conversion |
| 6 | **Project** setup | Projects + WBS/CBS | ◐ **manual** — no Contract→Project conversion |
| 7 | Baseline / schedule | — | ❌ no Gantt/baseline |
| 8 | **Procure** materials (PR→RFQ→PO→GRN) | Procurement + Inventory | ✅ (PO form is minimal — see §F) |
| 9 | **Subcontract** trades | Subcontracts + variations + claims | ✅ |
| 10 | **Site** execution (diary, SI, delays) | Site module | ✅ |
| 11 | **Engineering** (drawings/RFI/submittals) | Engineering + DocControl submittals | ◐ |
| 12 | **Quality** (ITP/NCR/snags) | Quality module | ✅ |
| 13 | **HSE** (PTW/toolbox/incidents) | HSE module | ✅ |
| 14 | **Progress billing** (IPC to client) | Contracts payment certificates | ◐ (not linked to EVM/%-complete) |
| 15 | **Cost capture → EVM** | Projects EVM | ◐ (actuals entered, not auto-fed from PO/invoices/timesheets) |
| 16 | **Invoice client (AR)** + receipt | Finance customer invoices + AR aging | ✅ |
| 17 | **Pay suppliers/subs (AP)** + GL | Finance AP + payments + double-entry | ✅ |
| 18 | **Variations / EOT** | Projects + Subcontracts variations, EOT | ✅ |
| 19 | **Project close-out** | — | ❌ no closeout workflow |
| 20 | **Financial period close + statements** | — | ❌ no period close, no P&L/B-S |
| 21 | **Handover → Warranty (DLP)** | — | ❌ no warranty/DLP tracking |
| 22 | **AMC / service contract** post-handover | AMC + PPM | ◐ **not persisted, not billed** |

**Verdict:** A project can be *operated* end-to-end at the data-entry level, but **the chain is not automated** (stages 5, 6, 15 are manual re-keying), and it **does not close the loop**: no project closeout, no warranty/DLP, no period-close/statements, AMC unpersisted. **A contractor could run day-to-day ops but could not close a project's books or its lifecycle inside AURA.** Lifecycle completeness ≈ **60%**, automation ≈ **25%**.

---

## B. CAPACITY PLANNING (1000 staff · 200 projects · 50 companies · 20M transactions)

> **Modeled, not load-tested** (no running deployment). Based on architecture inspection.

| Dimension | Assessment at target scale |
|---|---|
| Data volume (20M rows) | ✅ Trivial for Postgres **with indexes** (146 exist). Largest tables (events, journal lines, timesheets) need partitioning by month/tenant beyond ~50–100M. |
| 50 companies / multi-tenant | ◐ App-level tenant filter works; **without DB-enforced RLS a query bug = cross-company leak** (already happened — §7.1). At 50 tenants this is a data-governance risk, not a perf one. |
| 1000 concurrent users | ◐ Stateless NestJS scales horizontally **if** in-memory stores are off and a real session store is used; **single Postgres connection pool** is the first bottleneck (no pgBouncer/replicas configured). |
| 200 projects EVM/aging reports | ❌ **Aggregation endpoints (AR/AP aging, EVM) load rows then compute in-app** — O(n) per request, no projections/cache. At scale these are the first endpoints to time out. |
| Write throughput | ◐ Outbox relay is a **single poller** (`SKIP LOCKED`) — fine to ~hundreds/sec; high-volume needs Kafka/partitioned relay (blueprint §4 defers this). |
| List endpoints | ❌ **`limit`-only, no pagination** → large lists do unbounded scans/transfers. |
| Caching | ❌ none — every read hits Postgres. |
| **Capacity verdict** | **Functional to ~mid-hundreds of users / a few M rows; will degrade on reports & lists before it breaks on data volume.** Needs: pagination, projections for analytics, Redis cache, pgBouncer + read replica, table partitioning. |

---

## C. PERFORMANCE — measured posture + a real test plan

**What is verifiable from code (not runtime):**
- ❌ No pagination contract (limit-only) → unbounded result sets.
- ❌ In-app aggregation (aging/EVM) instead of SQL/projection → CPU + memory grow with tenant size.
- ⚠ Single `pg` Pool, no batching, no streaming exports, no statement timeout.
- ❌ No caching layer.
- ✅ Indexes on tenant/status/FK; ❌ no composite/partial indexes for hot paths.
- ⚠ N+1 risk where services list-then-loop (e.g. PPM generate-due iterates schedules; aging maps all invoices).

**What cannot be claimed without measurement (and the first report wrongly implied it could):** query latency, p95/p99, memory, CPU, throughput — **none measured; no APM exists.**

**Required measurement plan (to produce real numbers):**
1. Add k6/Artillery load profiles for the 5 hot endpoints (list invoices, AR aging, EVM, dispatch board, search).
2. Enable `pg_stat_statements` + slow-query log (>200ms) on Supabase.
3. Add OpenTelemetry traces → capture p50/p95/p99 per endpoint.
4. Seed 50 tenants × representative volumes; run 200 VU ramp.
5. Record memory/CPU under load (container metrics) — **prerequisite: containerization, which is missing.**

**Performance grade today: Unverifiable / structurally at-risk (~40%)** — the design has clear bottlenecks (pagination, aggregation, cache) that *will* surface at the stated scale.

---

## D. RISK REGISTER

| # | Risk | Prob. | Impact | Priority | Mitigation |
|---|---|:--:|:--:|:--:|---|
| R1 | Cross-tenant data leak (RLS bypassed by service role) | High | Critical | 🔴 P0 | FORCE RLS + least-priv role + tenant GUC |
| R2 | Runs auth-off by default; secrets in plaintext | High | Critical | 🔴 P0 | Enforce auth; vault + rotate keys |
| R3 | No CI/CD → regressions ship silently | High | High | 🔴 P0 | Pipeline w/ test+migration gate |
| R4 | No backups/DR plan → data-loss event unrecoverable | Med | Critical | 🔴 P0 | Automated backups + restore drill |
| R5 | AMC in-memory → service data lost on restart | High | High | 🔴 P0 | Persist to Postgres |
| R6 | No observability → outages undiagnosable | High | High | 🟠 P1 | OTel + metrics + alerts |
| R7 | Report/list endpoints degrade at scale (no pagination/cache) | Med | High | 🟠 P1 | Pagination + projections + cache |
| R8 | Deal chain manual (no Tender→Contract→Project) → adoption friction, data drift | High | Med | 🟠 P1 | Conversions + wire saga |
| R9 | No financial statements/period-close → not a system of record for finance | High | High | 🟠 P1 | Statements + close workflow |
| R10 | AI marketed but heuristic-only / no live model | Med | Med | 🟡 P2 | Wire provider + scope claims |
| R11 | No e2e/coverage gate → silent breakage of chains | Med | Med | 🟡 P2 | e2e + coverage threshold |
| R12 | No multi-currency → unusable for cross-border groups | Med | High | 🟡 P2 | Multi-currency + FX |
| R13 | UX immaturity (free-text supplier, no line-items on PO) → bad data, rework | High | Med | 🟡 P2 | Master-data pickers + line items |
| R14 | No i18n/RTL → limits UAE/Arabic market fit | Med | Med | 🟡 P2 | i18n + RTL |
| R15 | Single DB / no replica → availability ceiling | Low | High | 🟢 P3 | pgBouncer + read replica |

---

## E. AI LAYER — REALITY CHECK (what it can *actually* do)

Verified by reading `intelligence/autonomy.service.ts`, `mcp-server.service.ts`, `pricing.service.ts`, `core/ai/ai.service.ts`.

| Capability the owner expects | Reality in code | Verdict |
|---|---|---|
| Take a decision autonomously | `autonomy.service` = **rule-based proposal engine**; `resolveMode(value, variance)` picks observe/suggest/assist/operate by **numeric thresholds**, then propose/execute/reject workflow. **No LLM reasoning.** | ◐ heuristic, not AI decisioning |
| Write a Purchase Order | No PO-generation tool/agent wired; autonomy proposes generic actions only | ❌ |
| Review a contract | No contract-analysis path | ❌ |
| Analyze risk | Heuristic insights/briefing; no model, no risk model | ◐ heuristic |
| Extract data from a PDF | **No OCR, no document extraction** anywhere | ❌ |
| Suggest a vendor | No recommender; supplier master is plain CRUD | ❌ |
| Chat / copilot on real data | `ai.service` uses Claude **only if `ANTHROPIC_API_KEY` set**, else `LocalProvider` (no model calls). Default = no model. | ◐ config-gated, unexercised |
| RAG over company docs | `vector-store` uses **lexical JSON-cosine**, not pgvector/ANN | ◐ toy-grade |
| MCP tool exposure | `mcp-server` is a **protocol shell** (tools/list, tools/call) — no business tools registered | ◐ scaffold |

**AI verdict:** the layer is **honest scaffolding with guardrails and an autonomy *workflow*, but it is not an AI product.** Out of the box it makes **zero model calls** and performs **zero of the six owner-expected AI actions**. Real value needs: a live provider key, pgvector, registered MCP tools (PO/vendor/contract), and an OCR/extraction pipeline. **AI usefulness today ≈ 20%.**

---

## F. UX ANALYSIS (effort to do real work)

Measured on the **Create Purchase Order** flow (`po-create.tsx`):

| Metric | Finding |
|---|---|
| Screens to create a PO | 1 |
| Fields | **3** (title, supplier, value) + submit |
| Clicks | ~4 |
| Speed | Fast (single inline form) |
| **But:** supplier is **free-text**, not a picker from the supplier master | ❌ data-quality risk |
| **But:** **no line items** (qty/rate/item) — a "PO" with a single lump value | ❌ not a real PO |
| **But:** no PR link, no project/cost-center, no approval step in-form | ❌ |

**Pattern across the 22 new modules:** consistent, low-click, fast to learn — **but utilitarian and shallow**: free-text where master-data pickers belong, lump-sum where line-items belong, no wizards for multi-step processes, no inline validation, no in-context help. **A user won't get lost (good IA via ⌘K + nav), but they will enter low-quality data and hit ceilings on anything beyond a header-level record.** UX maturity ≈ **50%**; data-integrity-by-UX ≈ **35%**.

---

## G. BUSINESS COVERAGE — PLANNED vs DELIVERED (precise, per module)

Method: blueprint Module-Map §2 lists each module's intended **pages/capabilities**; counted against what exists in code. (322 API endpoints exist in total across 34 controllers — but endpoint count ≠ business coverage; the table below counts *capabilities*.)

### Finance — planned 19 capability areas
Planned: GL · AP · AR · VAT · Cash · Bank · Reconciliation · Budget · Cost Centers · Profit Centers · Intercompany · Consolidation · Fixed-Assets-GL · Bonds · Retention · Project-Finance · WIP · Rev-Rec(IFRS15) · IFRS.
**Delivered ≈ 9** (GL, AP, AR, VAT, Cash/petty, Bank, Reconciliation, Bonds, Retention◐). **Missing 10** (Budget, Cost Centers, Profit Centers, Intercompany, Consolidation, Fixed-Asset GL, Project-Finance, WIP, Rev-Rec, IFRS).
**Finance business coverage ≈ 47%** (not 80% — the delivered parts are deep, but half the *planned* finance surface is absent).

### Procurement — planned 12
Planned: Vendor Registration · Evaluation · Performance · PR · RFQ · Bid Comparison · PO · Blanket PO · Framework Agreements · Call-Off Orders · Contracts · 3-Way Match · Payables hand-off.
**Delivered ≈ 7** (Vendor Reg, PR, RFQ, Bid Comparison, PO, 3-Way◐, Payables hand-off). **Missing** Evaluation, Performance, Blanket PO, Framework Agreements, Call-Off, Procurement-Contracts.
**Procurement coverage ≈ 54%.**

### Projects — planned 18
Planned: Dashboard · WBS · CBS · Budget · Baseline · Progress · Productivity · Cost Control · EVM · Delay Analysis · EOT · Variations · Revenue · Cash Flow · Forecast · Resource Planning · Risk Register · Closeout.
**Delivered ≈ 7** (WBS, CBS, EVM, Delay, EOT, Variations, Progress◐). **Missing** Dashboard, Budget, Baseline, Productivity, Cost Control, Revenue, Cash Flow, Forecast, Resource Planning, Risk Register, Closeout.
**Projects coverage ≈ 39%.**

### Extrapolated coverage (same method, lighter sampling)
| Module | Planned areas | Delivered | Coverage |
|---|--:|--:|--:|
| Finance | 19 | 9 | **47%** |
| Procurement | 12 | 7 | **54%** |
| Projects | 18 | 7 | **39%** |
| HR & Payroll | ~14 | ~8 | ~57% |
| Inventory | ~10 | ~5 | ~50% |
| Subcontracts | ~9 | ~5 | ~55% |
| CRM & Sales | ~10 | ~5 | ~50% |
| Tendering/Estimating | ~9 | ~3 | ~33% |
| Quality / HSE / Site | ~10 each | ~5 | ~50% |
| Engineering | ~8 | ~3 | ~38% |
| Assets / Fleet | ~9 | ~5 | ~55% |
| AMC | ~8 | ~4 (unpersisted) | ~40% |
| **Weighted business coverage** | — | — | **≈ 48%** |

**Key insight for the owner:** AURA's *modules exist* (breadth) but each delivers roughly **half its intended business surface** — and the **highest-value finance/PM capabilities (statements, budgeting, consolidation, rev-rec, cost control, forecasting, closeout) are the missing half.** This is why "system of record" status is not yet earned despite 17 modules.

---

## H. BOTTOM LINE (owner's questions, answered)

| Owner question | Answer |
|---|---|
| Can I run a project Lead→Warranty? | **Partly** — ops yes; chain is manual; no closeout/warranty/period-close (~60% lifecycle, ~25% automated). |
| Will it scale to 1000/200/50/20M? | **It will function but degrade on reports/lists** before data volume bites; needs pagination+projections+cache+RLS+replicas. Not load-tested. |
| Real performance numbers? | **None exist** — no APM/load tests; structural bottlenecks identified. |
| Biggest risks? | R1 tenant leak, R2 auth/secrets, R3 no CI, R4 no backups, R5 AMC volatility (all P0). |
| Is the AI real? | **No** — heuristic + scaffolding; 0 model calls by default; 0/6 expected AI actions. |
| Is the UX good enough? | Fast & learnable, but **shallow** (free-text supplier, no PO line items) → data-quality risk. |
| True business coverage? | **≈ 48% weighted** — modules are ~half-built; the missing half is the high-value finance/PM depth. |

**Headline:** AURA OS is a **well-architected ~48%-business-complete vertical ops system**, not yet a **system of record** or an **AI product**. The path to commercial is: close the **finance/PM depth** (statements, budgeting, cost-control, rev-rec, closeout), **automate the deal chain**, **enforce tenancy + ship DevOps/observability**, and **make the AI real or rescope the claim**.

*End of Part 3. Source-verified where measurable; capacity & performance explicitly modeled. No files modified.*

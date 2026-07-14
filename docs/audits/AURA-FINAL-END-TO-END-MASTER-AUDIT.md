# AURA OS — Final End-to-End Master Audit

**Date:** 2026-07-14 · **Method:** verified against the live tree (`main` @ `6e099e1`), not from memory/PR text.
**Scope:** whole system as ONE connected business operating system for a project-based ELV / technology-integration contractor.

> Evidence convention: every conclusion cites a path. `modules/<m>/src/...` = business module; `core/src/...` = kernel;
> `apps/api/src/...` = HTTP host; `apps/web/...` = UI; `infrastructure/migrations/NNNN_*.sql` = schema.
> Where a conclusion is inferred rather than line-verified it is marked **(inferred)**.

---

## 0. Executive verdict

AURA OS is a **genuinely event-driven, multi-module commercial+delivery platform** — far past a CRUD collection. The
**deal chain is real and automated** (opportunity → tender → contract → project) via a transactional outbox and 20
idempotent reactors (`apps/api/src/events/cross-module-subscriber.ts`). Finance is wired to operations by events
(inventory GL, IPC→AR, asset disposal, subcontract claims). The CRM commercial layer (S1–S9) is deep and closes the
acquisition loop.

It is **not yet a complete project-business operating system**, for four verified reasons:

1. **Pre-award technical discovery is missing** — no Requirement, Site Survey, or Solution/Design-scope entity
   (`grep` for `requirement|site.survey|solution.design` returns no domain entities). Scope first materialises as a
   **tender BOQ**, so the STRATEGY→…→SCOPE→BOQ front half of the lifecycle is only partially executable.
2. **Pre-award supplier sourcing does not feed the estimate** — RFQ/supplier-quote comparison exists but only in
   **Procurement, post-award** (`modules/procurement/src/rfq.service.ts`). The cost build-up
   (`modules/tendering/src/domain/estimate.ts`) takes **manually entered** rates; supplier quotes never flow into it.
3. **Commercial governance is bypassable** — a quotation may be `send` directly from `draft`, skipping the
   `internal_review → approved` gate (`modules/crm/src/domain/quotation.ts:176`); there is no enforced margin/discount
   threshold. Cost build-ups are **replaced, not versioned** (`estimate.service.ts:47-49`).
4. **Tenant isolation is not enforced end-to-end** — RLS is partial and deliberately deferred (see §6). This is the
   single open platform-level correctness gap.

Answers to the seven final questions are in §9.

---

## 1. Verified architecture

**Monorepo** (pnpm + turbo). Dependency direction is enforced downward: `shared` (framework-free domain) ← `core`
(kernel) ← `modules/*` (business) ← `apps/api` (host) / `apps/web` (BFF+UI); `packages/sdk` is spec-generated.

| Layer | Location | Evidence |
|---|---|---|
| Shared domain (pure) | `shared/src/domain/*` | 20+ deterministic rule files, e.g. `opportunity-health.ts`, `forecast-snapshot.ts`, `estimate` rules in tendering |
| Kernel | `core/src/*` | events, tenancy, identity/access, audit, workflow, jobs, numbering, dms, forms, projections, reliability |
| Transactional outbox | `core/src/events/outbox-relay.ts`, `postgres-event-store.ts`, `tx.ts` | events appended in the same tx as the write, relayed to the bus |
| Event bus + reactors | `core/src/events/event-bus.ts`, `apps/api/src/events/cross-module-subscriber.ts` | **20** `bus.subscribe` handlers |
| Business modules (18) | `modules/*` | amc, assets, contracts, crm, doccontrol, engineering, finance, fleet, hr, hse, inventory, procurement, projects, quality, site, subcontracts, tendering, (+ intelligence) |
| Intelligence | `intelligence/src/*` | ai-context engine, guardrails, autonomy, insight, pricing, process-mining, vector-store, mcp-server, project-ledger |
| HTTP host | `apps/api/src/*` | ~90 controllers registered in `app.module.ts`; 32 use `class-validator` DTOs |
| Web | `apps/web/*` | Next.js app-router; BFF routes under `app/api/**` proxy to the API (`lib/api.ts` `apiBase()`), 5-page CRM IA + module pages |

**Store pattern is uniform and correct**: every aggregate has `X-store.ts` (interface + Symbol), `in-memory-X-store.ts`,
`postgres-X-store.ts`, selected by `DATABASE_URL` in each `*.module.ts`. This gives no-DB boots and clean substrate
swap. Verified across tendering/contracts/projects/procurement/finance/inventory/engineering/crm.

**Authorization** is server-side: `PermissionsGuard` (`@aura/core`) + per-service `access.assert(...)`; every business
module calls `access.assert` at least at its primary mutation (`grep` shows ≥1 per module).

**Audit**: `core/src/audit/audit.service.ts` (+ test). **Background processing**: `core/src/jobs/background-job.service.ts`.
**Three-way match**: owned by Finance as a port (`modules/finance/src/po-match.port.ts`) — the rule (invoice ≤ PO / received-GRN)
lives in Finance; an app-layer adapter reads Procurement+Inventory (ADR-0004, documented synchronous-read tradeoff).

Architecture debt is **low and mostly acknowledged in-code** (RLS deferral; po-match runtime coupling flagged as a
deliberate tradeoff; `created_by` text-vs-uuid normalised in 0150). No competing sources of truth were found for the
deal chain — provenance is by reference (`sourceOpportunityId`, `sourceTenderId`, `tenderId`, `contractId`), not copy.

---

## 2. Verified module inventory (depth, not labels)

| Module | Aggregates (stores/services) | Depth |
|---|---|---|
| **CRM** | account, contact, lead, opportunity, opportunity-depth, signal, quotation, activity, forecast-snapshot; services incl. lead-conversion | **Deep.** S1–S9 complete (signal→lead→opp→depth→register→journey→health→forecast→growth reactors). Evidence: `modules/crm/src/*`, migrations 0144–0162 |
| **Tendering/Estimating** | tender, boq, estimate (rate build-up), bid-score, win-loss | **Deep commercial engine.** `estimate.service.ts` folds build-ups over BOQ; `domain/estimate.ts` models material/labour/plant/subcontract + indirect/overhead/profit |
| **Contracts** | contract, bond, clause, obligation, payment-certificate (IPC) | **Deep.** IPC certification → AR reactor; bonds/guarantees; obligations |
| **Projects** | project, wbs, cbs, schedule, variation, closeout, delay-eot, cashflow-forecast | **Deep.** CBS synced from tender BOQ; variations; closeout; EOT; cashflow |
| **Procurement** | supplier, purchase-request, rfq, purchase-order, framework-agreement | **Deep.** PR→RFQ→quotes→award→PO; `lowestQuote` comparison |
| **Finance** | account, journal, invoice(AP), customer-invoice(AR), payment, budget, period-close, tax, cost-center, profit-center, petty-cash, post-dated-cheque, bank-guarantee, bank-transaction/reconciliation; statements | **Very deep.** Double-entry trigger (0050); GL from reactors; period close; rev-rec; FX; PDC |
| **Inventory** | stock (WAC valuation), transfer, goods-receipt | **Deep.** Perpetual GL postings on movement; reorder→PR reactor |
| **Subcontracts** | subcontract (+ claims, backcharge, retention) | **Medium-deep.** Claim certified→AP reactor; retention release; backcharge debit note |
| **Engineering** | rfi, submittal, drawing, design-change, bim-model, technical-query, engineering-document | **Deep (post-award).** design-change.approved→variation; document.submitted→HSE routing |
| **AMC/Service** | amc (work orders, tickets, escalation) | **Medium.** workorder.completed→AR reactor |
| **HR** | hr (timesheets, attendance, expense claims, advances, WPS) | **Medium.** single service, several migrations |
| **Fleet** | fleet (traffic fines, salik) | **Thin-medium** |
| **Assets** | assets | **Medium.** asset.disposed→GL reactor |
| **Site** | site (instructions) | **Thin-medium** |
| **Quality** | quality (ITPs, material approvals) | **Medium** |
| **HSE** | hse (toolbox talks, risk assessments) | **Medium.** receives engineering risk-assessment routing |
| **DocControl** | doccontrol (submittals/transmittals) | **Medium** |
| **Intelligence** | AI context, guardrails, autonomy, insight, pricing, process-mining, vector-store, MCP | **Present, advisory.** Guardrails exist; does not mutate authoritative truth **(inferred from `ai-guardrails.service.ts` + AURA law)** |

---

## 3. The actual, implemented business lifecycle (verified)

Legend: **✅ executable** · **🟡 partial** · **❌ not modelled**.

| Reference stage | State | Where / evidence |
|---|---|---|
| Strategy | ❌ | no strategy/plan entity |
| Market intelligence | 🟡 | `intelligence/src/*` advisory; `crm signal` sources incl. MARKET/INTELLIGENCE |
| Signal / prospect discovery | ✅ | CRM S3 `signal.ts` + Radar; growth reactors (S9) |
| Lead | ✅ | CRM S1 `lead` + `leadAttention` + Lead Command |
| Opportunity | ✅ | CRM `opportunity` + depth (stakeholders/commitments/register), health, forecast |
| Requirements | ❌ | **no Requirement entity** |
| Site survey / discovery | ❌ | **no Survey entity** |
| Solution design | ❌ | **no Solution entity** (Engineering starts post-award at submittal/drawing) |
| Scope | 🟡 | only as tender **BOQ** (`tendering/boq`) — no scope object upstream |
| BOQ | ✅ | `modules/tendering/src/boq-store.ts` (authoritative, one per tender) |
| Estimation | ✅ | `estimate.service.ts` rate build-ups folded over BOQ |
| Supplier/subcontractor sourcing | 🟡 | exists in Procurement **post-award only**; not at bid time |
| RFQ | 🟡 | `procurement/rfq.service.ts` (post-award) |
| Bid/quote comparison | 🟡 | `lowestQuote` in RFQ (post-award); **not fed into estimate** |
| Cost build-up | ✅ | `domain/estimate.ts` (material/labour/plant/subcontract + indirect/overhead/profit) |
| Pricing | ✅ | selling rate = cost + margin; applied to BOQ |
| Margin & risk review | 🟡 | margin computed; **no enforced review/threshold** |
| Commercial approval | 🟡 | quotation `approve` exists but **bypassable** (`send` from `draft`) |
| Quotation / tender submission | ✅ | CRM quotation lifecycle (0146); tender submit event |
| Clarification | 🟡 | quotation under-negotiation status; no structured clarification log |
| Revision / value engineering | ✅ | quotation revisions (Rev n, `quotation.ts`) |
| Negotiation | 🟡 | opportunity buying-journey + quotation `under_negotiation` |
| Award / won | ✅ | `crm.opportunity.stage_changed`=won → reactor |
| Contract | ✅ | `contracts` module; tender.awarded→contract reactor |
| Budget baseline | 🟡 | project CBS synced from tender BOQ; **explicit budget baseline snapshot** partial |
| Project mobilization | 🟡 | project created (planned); WBS/CBS seeded |
| Planning / scheduling | ✅ | `projects/schedule.service.ts` |
| Procurement | ✅ | full P2P |
| Inventory / logistics | ✅ | stock/transfer/GRN + WAC |
| Site execution | 🟡 | `site` (instructions); progress via WBS |
| Engineering submittals | ✅ | `engineering/submittal` |
| Document control | ✅ | `doccontrol` |
| Quality | ✅ | `quality` (ITP, material approvals) |
| HSE | ✅ | `hse` |
| Progress measurement | 🟡 | WBS spend/rollup; formal % measurement→IPC link partial |
| Variations / change control | ✅ | `projects/variation` + engineering reactor |
| Payment certificates / IPC | ✅ | `contracts/payment-certificate` → AR reactor |
| Invoicing | ✅ | finance customer-invoice(AR) + invoice(AP) |
| Collection | 🟡 | receivables + overdue-AR advisor; no dunning workflow |
| Testing & commissioning | 🟡 | closeout module; no explicit T&C entity **(inferred)** |
| Handover | 🟡 | `projects/closeout.service.ts` |
| Defect liability / warranty | 🟡 | closeout + assets warranty fields **(inferred)** |
| AMC / service | ✅ | `amc` |
| Renewal | ✅ | S9 contract.completed→RENEWAL_DUE signal |
| Cross-sell / upsell / expansion | ✅ | S9 project.completed→EXPANSION signal |
| New commercial signal | ✅ | closes to S3 Radar |

**Net:** the **delivery + finance back half is strong**; the **commercial front half from Requirements→Approved-Price is
the incomplete region** (survey/solution/scope objects missing; sourcing not feeding estimate; governance soft).

---

## 4. Cross-module chain audit (the 10 backbones)

| # | Chain | Verdict | Evidence / gap |
|---|---|---|---|
| 1 | Commercial-to-delivery (signal→…→project) | **🟡 mostly automated** | opp.won→tender→contract→project reactors; **BOQ is authoritative in tendering, snapshotted into quotation lines and project CBS** (not one shared entity — correct). Front half (survey/solution/scope) missing |
| 2 | Contract-to-project handoff | **✅ automated** | `contract.signed`→project + WBS root + CBS from tender BOQ (`cross-module-subscriber.ts:145-199`) |
| 3 | Procure-to-pay | **✅ automated** | PR→RFQ→award→PO; grn.created→PO received + AP suggest; 3-way match port in Finance |
| 4 | Project-to-cash | **✅ automated** | ipc.certified→AR invoice (`cross-module-subscriber.ts:282`); receivable in finance |
| 5 | Change-to-cash | **🟡 partial** | engineering design_change.approved→draft variation; variation→contract value; **client submission/negotiation of variation not workflow-enforced** |
| 6 | Engineering-to-execution | **🟡 partial** | submittals/drawings/design-change exist; **approved-for-construction gating to site execution not enforced** |
| 7 | Inventory & asset flow | **🟡 partial** | receipt→stock→issue→GL; **issue→installed asset / warranty link not automated** |
| 8 | Record-to-report | **✅ mostly** | GL from inventory/IPC/asset/subcontract reactors + double-entry trigger; period close; **not every operational event posts (e.g. payroll→GL partial)** |
| 9 | Customer lifecycle | **✅** | prospect→…→delivered→S9 growth signal (full circle) |
| 10 | Work / comms / intelligence | **🟡** | Activities + unified timeline + advisor + AI guardrails present; **email/WhatsApp/calls are integrations, largely not wired** |

---

## 5. Business-control audit

| Decision | Governed? | Evidence |
|---|---|---|
| Lead conversion | ✅ transactional, idempotent, lineage | `lead-conversion.service.ts` |
| Pursue / No-pursue | ✅ recorded (scored) | CRM S6 `buying-journey.ts` |
| Bid / No-bid | 🟡 `estimating.bid.decided` event exists; enforcement unclear | catalog + `bid-score.service.ts` |
| Estimate approval | ❌ no approval; re-estimate **replaces** build-up (no version) | `estimate.service.ts:47-49` |
| Margin approval | ❌ margin computed, **no threshold/gate** | `domain/estimate.ts` |
| Discount approval | ❌ not governed | `quotation.ts` |
| Quotation approval | 🟡 gate exists but **bypassable** (`send` from `draft`) | `quotation.ts:174-176` |
| Tender submission approval | 🟡 event exists; enforcement partial | catalog |
| Contract approval | 🟡 status machine; workflow-gating partial | `contract.service.ts` |
| Procurement approval | ✅ workflow engine (`po.approval` seeded, threshold) | `core/src/workflow/*`, WorkflowSeeder |
| Variation approval | ✅ QS review/approve on variation | `projects/variation.service.ts` |
| Payment certification | ✅ IPC certify | `payment-certificate.service.ts` |
| Invoice approval | ✅ invoice status + finance workflow | `finance/invoice.service.ts` |
| Payment approval | 🟡 payment status; SoD partial | `finance/payment.service.ts` |
| Write-off / cancellation | 🟡 soft-delete standardised (0116/0125); governance partial | migrations |
| High-impact AI actions | ✅ guardrails + autonomy service | `intelligence/src/ai-guardrails.service.ts`, `autonomy.service.ts` |

**Approval backbone exists** (workflow/saga engine, approval matrix admin, PermissionsGuard) but is **applied unevenly** —
strong in procurement/finance/variations, **soft in the commercial pricing phase** (estimate/margin/discount/quotation).

---

## 6. Tenancy, security, audit

- **RLS: partial + deferred.** 87 migrations declare `row level security`/policies and a **dynamic hierarchical RLS**
  migration exists (`0049_dynamic_hierarchical_rls.sql`), but numerous `CREATE TABLE` migrations ship without an inline
  per-table policy (e.g. `0044_crm_leads_opportunities`, `0062_procurement_suppliers`, `0060_finance_customer_invoices`).
  The API sets a request tenant context (`apps/api/src/main.ts` → `TenantContext.run`, default `dev-tenant` when
  unauthenticated). **Verdict:** application-level tenant scoping is pervasive in stores; **database-enforced isolation is
  incomplete** — this is the known open P0 (see roadmap). It is a real production blocker, not a feature.
- **AuthN/Z:** bearer verification in `main.ts`; `PermissionsGuard` global; `access.assert` in services; MFA migration
  (0134); roles/grants (0133).
- **Audit:** `core/src/audit/audit.service.ts` present; event store is itself an append-only history.
- **Error taxonomy / no 500-escape:** enforced elsewhere in the platform (per repo conventions) — the live 500s the user
  hit were a **missing-migration** symptom, not an escape (`column "assigned_to" does not exist`), now resolved by
  applying 0156–0162.

---

## 7. Estimation & pricing — the directive's focus (verified deep-dive)

- **BOQ ownership:** `aura_tendering_boq` (+ items), **one per tender**, authoritative in Tendering
  (`boq-store.ts`). It is **not** the same row across stages — Quotation is **generated from** the priced BOQ (lines
  snapshotted into the quotation) and Project **CBS is synced from** the tender BOQ (`projects/cbs.service.ts` `syncFromBoq`,
  invoked by the contract.signed reactor). **This is correct snapshot behaviour, not accidental duplication.**
- **Cost model:** `domain/estimate.ts` — CostType `material|labour|plant|subcontract|other`; `ResourceBreakdown`
  (supply price + wastage %, accessories, manpower blocks, transport, subcontract); build-up
  `direct → +indirect% (preliminaries) → +overhead% → +profit%` = `sellingRate`. **Contingency is not a first-class
  factor** (would be folded into indirect/overhead).
- **Cost vs price:** correctly separated (`directCost` vs `sellingRate`).
- **Versioning:** ❌ re-estimating an item **deletes the previous build-up and replaces it** (`estimate.service.ts:47-49`)
  — no cost-build-up history / audit of price evolution.
- **Pricing scenarios:** ❌ single build-up per BOQ item; no scenario/what-if comparison.
- **Supplier quotes → estimate:** ❌ RFQ/quotes (`procurement/rfq.service.ts`) are **post-award**; they do not populate
  build-up rates. Bid-time material/subcontract costs are hand-keyed.
- **Approved immutable price snapshot:** 🟡 the Quotation (approved) is effectively the snapshot, **but** approval is
  bypassable and there is no locked "commercial baseline" object carried into Contract; the contract value is set on the
  contract, not provably equal to an approved quotation total.
- **Direct-sale path:** `POST crm/opportunities/:id/convert-to-quotation` (`crm-opportunities.controller.ts:72`) creates a
  quotation straight from an opportunity (no tender/BOQ) → **direct quotations bypass the build-up engine** (no cost
  visibility/margin control on that path).

**Conclusion:** a **real cost-build-up + BOQ estimation engine exists and is well-modelled** — do **not** rebuild it.
The gaps are (a) sourcing not feeding it, (b) no versioning/scenarios, (c) governance not enforced, (d) direct-sale
pricing bypasses it, (e) no locked commercial baseline into contract.

---

## 8. Duplication & architecture-debt findings (verified)

- **No deal-chain data duplication** — provenance by reference; BOQ→quotation/CBS are legitimate snapshots.
- **Deterministic rules are single-sourced in `shared`** (health, forecast, buying-journey, attention, identity) —
  consumed by API+UI+tests. Confirmed no UI-side duplication of these rules.
- **`created_by` type drift** was already normalised (`0150_created_by_text_everywhere`).
- **po-match runtime coupling** (Finance reads Procurement/Inventory synchronously) — flagged in-code as a deliberate
  tradeoff, candidate for event-fed projection later (P2, not a blocker).
- **Compatibility fields:** none found to have become permanent duplicate truth.

---

## 9. Final classification (explicit answers)

1. **Is AURA a complete ERP?** — **No, but close on the delivery+finance half.** It has double-entry GL fed by
   operational events, P2P, project cost control, and multi-entity finance. It lacks full tenant-isolation enforcement
   and some enterprise controls, so it is a **strong near-complete ERP core**, not yet production-hardened.
2. **Is AURA a complete project-business operating system?** — **No.** The **pre-award commercial front half**
   (requirements → survey → solution → governed pricing → locked baseline) is incomplete, and **RLS** is unenforced.
3. **Fully executable end-to-end chains today:** Contract→Project handoff; Procure-to-Pay; Project-to-Cash (IPC→AR);
   Customer lifecycle incl. growth loop (S9); CRM acquisition (Signal→…→Forecast).
4. **Chains still needing spreadsheets/manual work:** pre-award **estimate sourcing & margin/commercial approval**;
   **requirements/site-survey/solution** capture; variation client-submission workflow; collection/dunning;
   inventory→installed-asset/warranty; email/WhatsApp/calls.
5. **Top-10 verified gaps** — see `docs/roadmap/AURA-FINAL-GAP-REGISTER.md` (P0: RLS; P1: commercial baseline &
   governance, requirements/survey/solution, estimate sourcing, progress-measurement→IPC, collection).
6. **Critical path to completion:** RLS enforcement → locked Commercial Baseline object + governed pricing approval →
   pre-award discovery (requirement/survey/solution/scope) → sourcing-into-estimate → measurement→IPC formalisation →
   collection → comms integrations. (Roadmap deliverable orders these by dependency.)
7. **Exact next slice:** **P0 — enforce Row-Level Security tenant isolation across all business tables** (finish the
   0049 dynamic-RLS pattern, add missing per-table policies, add a CI fitness test that fails on any tenant-scoped table
   lacking a policy). Rationale: it is the only *correctness/security* blocker, it underpins every other chain, and it is
   additive (no rewrite). Full slice spec in the roadmap.

---

*Companion deliverables:* Business Capability Map, Source-of-Truth Matrix, End-to-End Handoff Map (architecture/);
Gap Register, Execution Roadmap (roadmap/).

# AURA OS v2 — Clean-Architecture Blueprint

> **Greenfield ERP Operating System.** Built from zero with clean boundaries. The 7 existing repos are **reference-only** — we reuse *ideas, domain logic, and corrected algorithms*, never their files. This supersedes the "build-on-NEW-ERP" path in [`AURA-0.2-MASTER-BLUEPRINT.md`](AURA-0.2-MASTER-BLUEPRINT.md); that document remains the authoritative **harvest map** (what each repo is good for).
>
> **Date:** 2026-06-24 · **Status:** Blueprint draft — needs sign-off on the Decision Points (§13) before any scaffolding. · **No code until §13 is confirmed.**

---

## 0. Design goals (the contract this architecture must honour)

1. **Modular** — every business capability is an isolated module with its own data and API. Deleting or replacing one module never ripples.
2. **Event-driven** — every state change emits a domain event to an append-only ledger. The system's "truth" is the event stream.
3. **Data ownership** — a module owns its tables. **No cross-module DB joins. No shared business logic.** Cross-context needs go through events or published API contracts.
4. **Intelligence is read-only on the core** — the AI/Optimization layers *observe and propose*; only the owning module commits a change (through its own gate).
5. **Multi-tenant from line one** — tenant + company isolation is in the kernel, not bolted on later.
6. **Microservices-ready, not microservices-now** — a modular monolith with boundaries clean enough that any module can later be extracted to its own service without a rewrite.

---

## 1. Architectural style — Modular Monolith (Service-Oriented Domain Design)

```
            ┌──────────────────────────────────────────────────────────┐
            │  LAYER 5 · EXPERIENCE   (Next.js)                          │
            │  App shell · hub nav · dashboards · workflow UI · builders │
            └───────────────▲───────────────────────────▲──────────────┘
                            │ HTTP / RPC contracts       │ read-models
            ┌───────────────┴───────────────┐  ┌─────────┴──────────────┐
            │ LAYER 4 · OPTIMIZATION         │  │ LAYER 3 · INTELLIGENCE │
            │ Pricing(IEC) · CBS · client    │  │ Agents · forecasting · │
            │ profitability · tender scoring │  │ risk · decision engine │
            └───────────────▲───────────────┘  └─────────▲──────────────┘
                            │  (READ-ONLY: consume events + read-models, propose actions)
            ┌───────────────┴───────────────────────────────────────────┐
            │ LAYER 2 · BUSINESS MODULES   (each owns its data + events) │
            │ finance · procurement · inventory · projects · hr ·        │
            │ fleet · service/amc · sales/pre-contract                   │
            └───────────────▲───────────────────────────────────────────┘
                            │ commands ↑   events ↓ (transactional outbox)
            ┌───────────────┴───────────────────────────────────────────┐
            │ LAYER 1 · KERNEL  (the "OS")                               │
            │ multi-tenancy · auth/RBAC+ABAC · event store + bus ·       │
            │ workflow engine · numbering · audit · documents · money    │
            └────────────────────────────────────────────────────────────┘
```

**Why modular monolith (not microservices yet):** one deployable, one database, in-process calls — so we move fast and keep transactions simple — *but* with module boundaries, data ownership, and an event backbone strong enough that extraction to services later is a config change, not a rewrite. Microservices now would buy distributed-systems pain (sagas, eventual consistency everywhere, ops overhead) before we have a single working module. **Recommended: start monolith, design for split.**

---

## 2. The five layers (and which repo informs each)

| Layer | Responsibility | Primary reference repo | What we take (ideas only) |
|---|---|---|---|
| **1 · Kernel** | Multi-tenancy, auth/RBAC+ABAC, event store + bus, workflow engine, audit, numbering, documents, shared "Money/Party" types | NEW-ERP (event ledger, taxonomy, RLS) + AURA (event bus/replay, ABAC approval ceiling) | event taxonomy, self-healing type registry, RBAC+ABAC model |
| **2 · Business Modules** | The transactional ERP: finance, procurement, inventory, projects, HR, fleet, service/AMC, sales/pre-contract | NEW-ERP (deepest module/workflow map) | module list, workflows, field-level domain logic |
| **3 · Intelligence** | Agents, forecasting, risk scoring, decision/autonomy engine | AURA | AI architecture: observer → agents → autonomy modes → approval matrix → queue, RAG memory |
| **4 · Optimization** | Pricing (IEC closed-loop), cost-breakdown (CBS), client profitability, tender/bid scoring | Base 44 (IEC) + Enterprise (CBS/profitability) | the 4-layer IEC learning math; CBS roll-ups; LTV/profitability; 7-criteria bid scoring |
| **5 · Experience** | App shell, hub navigation, dashboards, workflow UI, template builder, admin center | NEW-ERP (IA/hub map) + Full/V01 (visual template builder) | 12-hub IA as reference, template-builder concept |

---

## 3. DECISION POINT #1 — Backend stack (shapes everything below)

| | **A · Monorepo + NestJS backend + Next.js web  (Recommended)** | **B · Next.js full-stack monolith** |
|---|---|---|
| Shape | `apps/web` (Next.js) + `apps/api` (NestJS modular monolith) in one pnpm/Turborepo workspace | One Next.js app; modules are enforced packages; API = route handlers / server actions |
| Boundary enforcement | **Strong** — NestJS modules + DI + CQRS bus enforce isolation natively | Medium — folders + lint rules (dependency-cruiser / eslint boundaries) |
| Event bus | NestJS CQRS `EventBus` + transactional outbox → Kafka-ready | custom dispatcher + outbox table + processor |
| Microservices extraction later | Easiest (a module is already a Nest module) | Possible but more refactoring |
| Ceremony / speed | More setup, more files; industry-standard for ERP-scale | Less setup; one framework you already know |
| Best when | You want a true long-lived "ERP OS" with hard boundaries | You want the cleanest possible single codebase fast |

**My recommendation: A.** An "ERP Operating System" with the data-ownership and microservices-ready goals you stated is exactly NestJS's sweet spot, and AURA already validated NestJS as its production target. The rest of this blueprint is written for **A**, but the *architecture* (layers, boundaries, events, domain) is identical under **B** — only the folder/framework specifics change.

**Database/runtime (same under A or B):** single **PostgreSQL via Supabase** (Auth + Postgres + RLS + Storage + Realtime — proven across all your repos), **schema-per-module** for data ownership, Redis later for cache/queues if needed.

---

## 4. Anatomy of a module (the canonical template)

Every business module is identical in shape — this is the law that keeps the system clean:

```
modules/<module>/
  domain/      # pure business logic: entities, value objects, invariants, calculations. NO I/O.
  services/    # use-cases / orchestration. Opens a tx, calls domain, writes outbox event.
  api/         # the ONLY public surface: command/query handlers + DTO contracts (versioned).
  events/      # this module's published event contracts (names + payload schemas) + subscribers.
  db/          # migrations + repositories for THIS module's schema only.
  ui/          # (web app) the module's screens, built against api/ contracts.
```

**Dependency rules (enforced by lint/CI):**

- ✅ A module may depend on the **kernel** and on **shared** (types only).
- ✅ A module may **subscribe to** other modules' published **events** and **call** their published **api/ contracts**.
- ❌ A module may **never** import another module's `domain/`, `db/`, or `services/`.
- ❌ **No SQL join across schemas.** Need data from another context? Get it via its api/, or keep a local read-model fed by its events.
- ✅ Intelligence/Optimization layers may **read** events + read-models and **call** api/ commands as *proposals* — they never write another module's tables directly.

---

## 5. Data ownership & the cross-module reality (DECISION POINT #2)

ERP data is highly relational, so "no cross-module joins" needs a concrete, pragmatic mechanism:

- **Write side:** each module owns a **Postgres schema** (`finance.*`, `procurement.*`, …). It is the only writer. Cross-context references are stored **by id only** — *no foreign keys across schemas*.
- **Read side (the pragmatic part):** cross-module questions ("project profitability" = finance + procurement + payroll + projects) are **not** answered by joining transactional tables. They are answered by:
  1. **Read-models** — denormalized projections built by subscribing to events (CQRS read side), living in a `reporting`/`read` schema; **or**
  2. the **Optimization/Intelligence layer**, whose entire job is cross-module synthesis from events + read-models.
- **Multi-tenancy:** every table carries `tenant_id` + `company_id`; **RLS** enforces isolation in the database (defence-in-depth), not just in app code.

> **Recommendation:** schema-per-module + id-only references + event-fed read-models for all cross-module reporting. This is the honest ERP pattern — it trades a little duplication for genuine module independence, and it makes the Intelligence layer's cross-cutting role natural instead of bolted-on.

**Decision #2 asks you to confirm:** schema-per-module in one DB *(recommended)* vs. database-per-module *(heavier, true microservices)*.

---

## 6. The event system (the backbone)

Non-negotiable: **every** state change emits an event. Mechanism:

1. **Command** hits a module's `api/` → `services/` opens a DB transaction.
2. Domain logic runs; the module writes its own tables **and** an event row into its **transactional outbox** (same tx → never lose an event, never emit a lie).
3. A **relay** drains the outbox into the **event bus** (in-process now; Kafka topic later — same contract).
4. **Subscribers** react: other modules update read-models; the **Intelligence layer** observes; the **workflow engine** advances; notifications fan out.

**Event contract** (reuse NEW-ERP's proven taxonomy as the reference): `module.aggregate.verb` (e.g. `finance.invoice.created`, `procurement.po.approved`, `inventory.stock.low`), `{ tenant_id, company_id, actor_id, occurred_at, version, payload }`, append-only, replayable. A **self-healing type registry** (from NEW-ERP) means a new event type never breaks an emit.

---

## 7. Kernel detail (Layer 1 — the "OS")

| Kernel service | What it provides | Reference |
|---|---|---|
| **Tenancy** | `tenant → company` hierarchy; context resolved per request; injected into every query + event | NEW-ERP multi-tenancy memo |
| **Auth** | Supabase Auth (real SSO/OIDC-ready); sessions; no persona-switch hacks | NEW-ERP |
| **AuthZ** | RBAC (role matrix) **+ ABAC** (approval-limit ceiling, tenant isolation) | AURA `rbac.ts` |
| **Event store + bus** | append-only ledger, outbox relay, replay, wildcard subscribers | NEW-ERP store + AURA bus/replay |
| **Workflow engine** | data-driven approval/state graphs (START/APPROVAL/CONDITION/AI_CHECK/NOTIFY/END) | AURA workflow-engine + NEW-ERP designer |
| **Numbering** | tenant-scoped document sequences (PO‑0001…) | NEW-ERP numberingService |
| **Audit** | immutable audit entries on every mutation | Base 44 immutable ledger pattern |
| **Documents** | upload/version/classify; storage abstraction | NEW-ERP documents + future OCR |
| **Shared kernel types** | `Money`, `Party`, `Address`, `Period`, `Quantity` — value objects every module reuses | new (clean) |

---

## 8. Domain model — the ERP universe (bounded contexts)

```
IDENTITY (kernel)      Tenant · Company · User · Role
PARTY                  Client · Supplier · Subcontractor · Employee (as Party projections)
SALES / PRE-CONTRACT   Lead · Tender · Estimation · PricingRun · Quote · SalesContract   (AURA deal-chain)
PROJECTS               Project · WBS · Task · Milestone · Risk · Variation · Snag · Handover
PROCUREMENT            PurchaseRequest · RFQ · SupplierQuote · PurchaseOrder · GRN · 3-way-match
INVENTORY              Item · Stock · Movement · Count · Allocation
FINANCE                GLAccount · Journal · Invoice(AP/AR) · Payment · Budget · VAT · Treasury · Guarantee
HR / PAYROLL           Employee · Attendance · Leave · Timesheet · PayrollRun · EOSB
FLEET / ASSETS         Vehicle · FuelLog · Maintenance · FixedAsset · Depreciation
SERVICE / AMC          Contract · Ticket · SLA · PPM · Warranty
```

Cross-context links are **id references**, resolved via api/ or read-models — never FK joins. Each context = one Layer-2 module.

---

## 9. Intelligence (L3) & Optimization (L4) — how the "brain" plugs in

Both layers are **pure consumers**: they read the event stream + read-models, and emit **proposals** (insights, recommendations, autonomous-action requests) back through modules' `api/` gates. They never own transactional truth.

- **Intelligence (AURA):** observer subscribes `*` → routes to role agents (CEO/CFO/PM/Procurement/HR) → autonomy engine (4 modes: Observe → Suggest → Assist → Operate) → approval matrix (value bands) → autonomy queue (replayable, explainable). RAG memory on **pgvector**.
- **Optimization (Base 44 + Enterprise):**
  - **IEC pricing** (4-layer closed loop): weight price sources → reality-gap vs actuals → trust-decay → truth-equilibrium/anomaly containment → *propose* calibrated catalog rates.
  - **CBS** roll-up variance, **client profitability/LTV**, **tender/bid 7-criteria** scoring.
- **Boundary rule (enforced):** an engine that wants to change a price/PO/budget emits a proposal event; the owning module decides via its workflow/autonomy gate. *Propose, never write.*

---

## 10. Experience layer (L5)

- **Next.js** app shell with **hub navigation** (reuse NEW-ERP's 12-hub IA as the proven map, rebuilt clean).
- **Design system** — one token set (avoid NEW-ERP's dual-CSS debt), accessible primitives, dense "control-room" aesthetic (AURA).
- **Workflow UI engine** — render the kernel's workflow graphs; approvals inbox.
- **Template builder** — visual document/template designer (concept from jeet-erp-full).
- **Per-role command centers** — CEO / CFO / PM / Vendor / Client portals fed by the Intelligence layer's "Today Brain".

---

## 11. Target repository structure (for recommended stack A)

```
aura-os/                      # new git repo
  apps/
    web/                      # Next.js — Experience layer (L5)
    api/                      # NestJS — kernel + modules + intelligence host
  core/                       # Kernel (L1): tenancy, auth, events, workflow, audit, numbering
  modules/                    # Business modules (L2) — finance/ procurement/ inventory/ …
  intelligence/               # L3 + L4: agents, forecasting, risk, pricing(IEC), CBS, profitability
  infrastructure/             # DB clients, Supabase, event-bus impl, storage, config
  shared/                     # framework-free types + value objects (Money, Party, contracts)
  package.json · turbo.json · pnpm-workspace.yaml
```

(Mirrors the `apps/ core/ modules/ intelligence/ infrastructure/ shared/` layout you drew.)

---

## 12. Legacy debt we are deliberately NOT carrying

From the prior audits — the clean build exists precisely to shed these: dual CSS token systems · `system_events` tenancy gaps retrofitted late · raw-SQL-only migrations with no ORM safety net · two parallel event/pre-contract implementations · persona-switch instead of real auth · SQLite/JSON-as-TEXT · in-process-only bus with no outbox · ~100 services of varying patterns.

---

## 13. Decision Points — confirm before any scaffolding

1. **Backend stack** — A) Monorepo + NestJS + Next.js *(recommended)* · B) Next.js full-stack monolith.
2. **Data ownership** — schema-per-module in one Postgres *(recommended)* · database-per-module.
3. **Repo location** — new sibling folder `Desktop/aura-os` as its own git repo *(recommended)* · inside the current repo · other.
4. **Package manager / monorepo tool** — pnpm + Turborepo *(recommended)* · npm workspaces · Nx.
5. **Keep Supabase** (Auth+Postgres+RLS+Storage) *(recommended)* · raw Postgres + separate auth.

---

## 14. Build roadmap (once §13 is signed off)

| Phase | Goal | Output |
|---|---|---|
| **0 · Foundation** | Monorepo + kernel skeleton | repo, CI, tenancy + auth + event store + outbox relay, one migration |
| **1 · First vertical slice** | Prove the pattern end-to-end on ONE module (Procurement: PR→PO→GRN) | module template, events flowing, web screens, tests |
| **2 · Event backbone hardening** | Bus + read-models + replay + workflow engine | reusable across modules |
| **3 · Intelligence seam** | Observer + AI provider + one read-only engine (risk) consuming events | proposals appearing in a queue |
| **4 · Module rollout** | Finance → Inventory → Projects → HR → Fleet → Service, one clean slice at a time | the ERP breadth |
| **5 · Optimization** | IEC pricing + CBS + profitability as L4 consumers | the differentiators |
| **6 · Experience** | Hub shell, dashboards, role command centers, template builder | the product surface |

---

## 15. Immediate next step

Confirm the five Decision Points in §13 (or just say "go with your recommendations"). Then I scaffold **Phase 0**: the monorepo, the kernel skeleton (tenancy + auth + event store + outbox), and the first migration — a small, runnable foundation you can see working before we add a single business module.

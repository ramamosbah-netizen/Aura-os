# Volume 2 — Product Architecture

[← Master index](README.md)

---

## 1. Overall Architecture

AURA OS is a **five-layer TypeScript monorepo** (pnpm + turbo) with strict inward dependency
flow. Clean/Hexagonal architecture with DDD bounded contexts: one business module = one context;
every persistence concern is a **port** with an in-memory adapter (tests, demo) and a Postgres
adapter (production), swapped by dependency injection on the presence of `PG_POOL`.

### 1.1 Layer diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            PRESENTATION LAYER                                │
│  apps/web — Next.js 16 (React 19)                                            │
│  93 pages · 204 BFF routes · 84 components · form-engine renderer            │
│  ⌘K palette · universal inbox · global search · saved views · AI dock        │
├──────────────────────────────────────────────────────────────────────────────┤
│                              API LAYER                                       │
│  apps/api — NestJS 11                                                        │
│  551 handlers · 32 controller areas · /api/v1 · idempotency keys · UUID pipe │
│  cross-module-subscriber (event reactors) · demo seeder · health             │
├──────────────────────────────────────────────────────────────────────────────┤
│          BUSINESS MODULES (17)                │      AI LAYER                │
│  modules/{amc,assets,contracts,crm,           │  intelligence/               │
│   doccontrol,engineering,finance,fleet,       │  ai-platform · guardrails    │
│   hr,hse,inventory,procurement,projects,      │  insights · autonomy         │
│   quality,site,subcontracts,tendering}        │  pricing · vector store      │
│  each: domain/ + services + store ports       │  process mining · MCP server │
│   (+ in-memory + Postgres adapters)           │  pipeline/ledger projections │
├──────────────────────────────────────────────────────────────────────────────┤
│                               KERNEL (core/)                                 │
│  events(outbox,bus,store) · workflow(+saga) · dms · identity(RBAC/ABAC)      │
│  audit · numbering · notifications · commands(bus,idempotency,locks)         │
│  builder(entity/form/workflow registries, approval matrix) · projections     │
│  jobs · time(calendar) · finance(fx) · integration(webhooks,connectors,SDK)  │
│  reliability(circuit breaker, rate limiter) · tenancy · config(flags) · ai   │
├──────────────────────────────────────────────────────────────────────────────┤
│                        SHARED CONTRACTS (shared/)                            │
│  domain(id,money,cdm,crm) · events catalog(71) · identity(jwt,org,access)    │
│  ai-provider port · dms document · workflow/saga types · forms engine core   │
│  integration(webhook,csv) · pagination                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE (infrastructure/)                        │
│  126 SQL migrations · RLS policy migrations · reporting views                │
│  Runtime: Postgres (Supabase) / in-memory dual mode                          │
└──────────────────────────────────────────────────────────────────────────────┘
        Dependency rule: apps → intelligence → modules → core → shared
        (never sideways between modules; cross-module = events only)
```

### 1.2 The load-bearing rules

1. **No module imports another module.** Cross-module behavior happens through domain events
   consumed by the app-layer reactor (`apps/api/src/events/cross-module-subscriber.ts`).
2. **Every store is a port.** `X-store.ts` (interface) + `in-memory-X-store.ts` + `postgres-X-store.ts`.
   The whole platform runs with zero infrastructure (demo/tests) or against Postgres — same code.
3. **Every business mutation emits a catalogued event in the same transaction** (outbox pattern,
   §7 below).
4. **Domain purity.** Calculation logic (double-entry balancing, WAC, EVM, EOSB bands, IFRS-15
   cost-to-cost) lives in pure domain functions under `modules/*/src/domain/`, unit-tested
   without I/O.
5. **Metadata over code** for UI behavior: forms are JSON schemas (Volume 5); navigation is a
   single `nav.ts` source feeding sidebar and command palette.

## 2. Kernel

Full documentation in Volume 4. Summary of the 21 service areas in `core/src/`:

| Area | Services | Purpose |
|---|---|---|
| `events` | event-bus, event-store (mem/pg), outbox-relay, tx | Transactional outbox → relay (`FOR UPDATE SKIP LOCKED`) → in-process bus |
| `workflow` | workflow.service, saga-orchestrator, stores | Definition-based workflows + compensating sagas, persisted state |
| `identity` | auth, access (RBAC/ABAC), org, permissions guard | JWT auth, roles/grants, `@Permissions()` decorator + guard |
| `dms` | dms.service, document store/storage (local/Supabase) | Document management with metadata + binary storage ports |
| `audit` | audit.service | Immutable audit trail of business actions |
| `numbering` | numbering.service | Deterministic, gap-controlled document numbering (per tenant/series) |
| `notifications` | notification.service + store | In-app notifications; delivery channels [Gap] |
| `commands` | command bus, idempotency (service+interceptor), lock service | CQRS command dispatch on spine modules; idempotency keys; advisory locks |
| `builder` | entity-registry, form-registry, workflow-orchestrator, approval-matrix | Metadata platform kernel (Volume 14) |
| `projections` | projection engine, snapshot engine, OLAP export | Event-fold read models, snapshots, exports |
| `integration` | webhook service/dispatcher/retry-worker, connector service, sdk-generator | Outbound webhooks with retry, connector registry, client SDK generation |
| `ai` | ai.service, claude-provider, local-provider, embedder | Provider seam implementations (Volume 6) |
| `finance` | exchange-rate.service | FX rates + base-currency conversion |
| `jobs` | background-job.service | In-process scheduled jobs (durable queue [Gap]) |
| `time` | calendar.service | Business calendars/working days |
| `reliability` | circuit-breaker, rate-limiter | Outbound call protection |
| `tenancy` | tenant-context | Per-request tenant propagation |
| `config` | feature-flag.service | Feature flags |
| `views` | saved-view.service + store | User saved views (filters/columns) |
| `http` | uuid.pipe | Route param guards |
| `projections/olap` | olap-export | BI-facing exports (Volume 16) |

## 3. Business Modules

Seventeen modules on the identical template (catalog with per-module depth in Volume 3):

**Deal chain:** CRM → Tendering → Contracts → Projects
**Operate:** Procurement, Inventory, Subcontracts, Site, Engineering, Doc Control, Quality, HSE
**Back office:** Finance, HR
**Asset side:** Assets, Fleet, AMC

Template anatomy (using `modules/tendering` as the reference):

```
modules/tendering/src/
  domain/                  ← pure functions: statuses, transitions, calculations
  tender-store.ts          ← port (interface)
  in-memory-tender-store.ts
  postgres-tender-store.ts
  tender.service.ts        ← orchestration: access → domain → store → event (one tx)
  boq-*, estimate-*, bid-score-*, win-loss-*   ← sub-entities, same pattern
  tendering.module.ts      ← Nest DI wiring (adapter chosen on PG_POOL)
  index.ts
```

## 4. AI Layer

Volume 6 in full. Architectural position: `intelligence/` is a **separate package above the
modules** — it reads module data through services/projections and the event stream, never the
other way. The kernel exposes exactly one seam (`AiProvider`), so swapping/adding LLM vendors
touches one directory (`core/src/ai/`).

## 5. Integration Layer

Volume 17 in full. Kernel-side: webhook subscriptions per event type with signed delivery +
retry worker + dead-letter; connector registry; SDK generator producing typed clients from
route metadata. App-side: CSV import/export (`shared/src/integration/csv.ts`), document
templates. Inbound REST is the primary surface; GraphQL [Gap].

## 6. Presentation Layer

Volume 10 in full. Next.js 16 App Router; server components fetch through BFF routes
(`apps/web/app/api/**`, 204 routes) which proxy `/api/v1` with header/session handling. Client
components receive data as props (no client fetch waterfalls); every mutation ends in
`router.refresh()`. Design system is CSS-custom-property based (`globals.css`) with dark/light
themes; forms render through the metadata engine.

## 7. Event Flow (the platform's spine)

```
  Service method (one DB transaction)
  ┌────────────────────────────────────────────┐
  │ 1. access check (RBAC/ABAC)                │
  │ 2. domain function → new/updated aggregate │
  │ 3. store.write(aggregate)                  │
  │ 4. eventStore.append(event)   ← same tx    │   71 catalogued event types
  └────────────────────────────────────────────┘
                     │ commit
                     ▼
        outbox-relay (poll, SKIP LOCKED)
                     ▼
              in-process EventBus
        ┌────────────┼──────────────┬─────────────────┐
        ▼            ▼              ▼                 ▼
  cross-module   projections    webhooks         notifications
  reactors (12+) (read models)  (signed, retried) (inbox)
        │
        ▼  examples (all live today):
  crm.opportunity.stage_changed[won] → tender registered
  estimating.tender.awarded          → contract created
  contracts.contract.signed          → project + WBS/CBS seeded
  inventory.stock.low                → purchase request raised
  inventory.grn.accepted             → stock + WAC + COGS journal
  subcontracts.ipc.certified         → AR invoice
  subcontracts.backcharge            → AP deduction
  amc.workorder.completed            → AR invoice
```

Properties: **atomic** (event persists iff the row does), **idempotent** (reactors guard with
natural keys), **inspectable** (`/events` page lists the stream; dead-letter table for failures),
**dual-runtime** (works identically in-memory and on Postgres).

## 8. Infrastructure

- **Database:** PostgreSQL (Supabase-hosted today). 126 sequential migrations with a fail-fast
  duplicate-number guard; RLS policies authored (0032, 0049, 0052) — enforcement is the
  deliberate final step before production (see Volume 7).
- **Storage:** DMS binary storage port — local-disk adapter + Supabase storage adapter.
- **Runtime duality:** with no `PG_POOL`, the entire platform runs in-memory (demo seeder
  included) — the property that makes tests fast and demos instant.

## 9. Deployment & Cloud Architecture

Current state and target (full treatment in Volume 19):

| Aspect | Today | Target |
|---|---|---|
| Packaging | `pnpm`/`turbo` builds; **no Dockerfiles** [Gap] | Multi-stage images per app |
| Topology | dev: API :4200 + web :3200 + Supabase | LB → n×API (stateless) + n×web; managed Postgres + object storage |
| CI | GitHub Actions: typecheck, tests, builds, Playwright smoke | + migration gate, image build/publish, deploy stages |
| Scaling | Stateless API design; outbox relay is horizontal-safe (SKIP LOCKED) | HPA on API/web; pg connection pooling (pgBouncer); queue for jobs |
| Observability | Nest logger + correlation id | OTel traces, Prometheus metrics, log aggregation [Gap] |
| DR / Backups | Supabase defaults, undocumented [Gap] | PITR + tested restore runbook |

## 10. Security Architecture

Summary (Volume 7 in full): JWT authentication with env-gated enforcement (`AUTH_REQUIRED`),
RBAC/ABAC evaluation engine with `@Permissions` guard, per-request tenant context, RLS policies
authored for 87 tables, immutable audit, parameterized SQL throughout, idempotency + advisory
locks on the spine. The design is sound; the **P0 posture items** — auth on by default, forced
RLS with least-privilege role, secret vaulting — are sequenced as the final pre-production task
(recorded decision: RLS enforcement is deliberately last, after feature completeness).

## 11. Scalability

| Concern | Mechanism today | Ceiling / next step |
|---|---|---|
| API | Stateless Nest, horizontal-ready | Add pgBouncer; no session affinity needed |
| Events | Outbox poll with SKIP LOCKED — safe with n relays | Move relay cadence → LISTEN/NOTIFY; queue for heavy reactors |
| Reads | Projections + reporting views (0113) | Read replicas; cache layer [Gap] |
| Aggregations | In-app (aging, EVM, statements) — fine at mid-market volumes | Push heavy folds into SQL views / OLAP export path |
| Files | Object storage via DMS port | CDN in front |
| Tenancy | Shared schema + tenant_id (+RLS when enforced) | Scales to thousands of tenants; per-tenant DB only if a whale demands it |

---

*Next: [Volume 3 — Complete Module Catalog](vol-03-module-catalog.md)*

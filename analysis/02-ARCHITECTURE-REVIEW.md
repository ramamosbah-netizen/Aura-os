# Architecture Review

**Score: 8.5 / 10** — one of the strongest architectures I have audited in a solo/small-team ERP. Loses points only for intelligence-layer drift and the modular-monolith's few leaky seams.

## 1. Style & patterns (evidence)

| Pattern | Verdict | Evidence |
|---|---|---|
| Modular monolith | ✅ Correctly executed | `pnpm-workspace.yaml`, 18 `modules/*`, each a workspace package with its own `index.ts` contract |
| Clean/Hexagonal (ports & adapters) | ✅ Consistent | every module: `domain/` + `*-store.ts` (port) + `in-memory-*` + `postgres-*` adapters + `*.service.ts` |
| DDD (bounded contexts) | ✅ Strong | one schema + event namespace per module; `domain/` holds pure entities |
| Event sourcing + Outbox | ✅ Textbook | `core/src/events/{event-store,outbox-relay,postgres-event-store}.ts`; mig 0001, 0012, 0013 |
| CQRS | ⚠️ Partial | command bus (`core/src/commands/command.bus.ts`) + projections (mig 0034/0035), but many services still read-write the same store directly |
| Saga / process orchestration | ✅ Present | mig 0043 saga execution engine; `builder/workflow-orchestrator.service.ts` |
| Multi-tenancy | ✅ First-class | `TenantContext` + `TenantScopedPool` bind GUC on every query, fail-closed |

## 2. SOLID assessment

- **S** — Single responsibility is honored at file granularity (store vs service vs domain). Services occasionally grow broad (e.g. CRM has 98 files partly *because* responsibilities are split well).
- **O** — Open/closed via the port pattern: swap `in-memory` ↔ `postgres` adapters at the DI seam without touching services. New LLM providers plug into `core/src/ai` behind `AiService`.
- **L** — Adapters honor their store interfaces; in-memory and pg adapters are interchangeable in tests (proven by 128 module tests running on in-memory adapters).
- **I** — Interfaces are per-entity stores, not god-interfaces. Good.
- **D** — Dependency inversion throughout; services depend on store *ports*, concrete adapters injected in `*.module.ts`. The `@Optional() @Inject(Token)` idiom (see `permissions.guard.ts`) is a documented workaround for a real Nest reflection gotcha (union types → `Object` in `design:paramtypes`).

## 3. Coupling & cohesion

- **Cross-module coupling:** enforced low by the "no cross-module DB joins; events + API only" law. Cross-module reactions go through the event spine + a `CrossModuleSubscriber` pattern (per memory: account growth reactors on `project.completed`). This is the right shape.
- **Cohesion:** high within modules; the `domain/` folders keep business rules out of I/O.
- **Kernel coupling:** every module depends on `@aura/core` and `@aura/shared` — expected and healthy (stable-dependencies principle: they change least).
- **Leaky seams (debt):**
  1. Some `postgres-*` stores assume `public.` schema and shared table prefixes (`aura_<module>_*`) — the "module owns its schema" law is *namespacing by convention*, not hard isolation. A rogue join is possible; nothing structurally prevents it.
  2. The web app calls the API by path-proxying (per memory, per-path proxy gotchas) rather than through the generated `@aura/sdk` — the type-safe client exists but the frontend doesn't consistently consume it.

## 4. Scalability

| Vector | Assessment |
|---|---|
| Horizontal (stateless API) | ✅ API is stateless; scales behind a load balancer. Outbox relay is the one stateful worker — needs single-runner or leader election (verify before multi-instance). |
| Data growth | ⚠️ Event store is append-only and unbounded; an archiver exists (`archive-events.mjs`) but retention/partitioning strategy is early. |
| Microservices extraction | ✅ The module boundaries + event contracts make extraction genuinely feasible — the "modular monolith, microservices-ready" claim is credible, not marketing. |
| Read scaling | ⚠️ Projections exist (mig 0034/0035) but are not applied uniformly; many reads hit primary stores directly. No read-replica routing. |

## 5. The intelligence-layer drift (the main architectural risk)

The README states the intelligence layer **"reads and proposes, never writes core."** That invariant is being violated:

- 40+ services now in `intelligence/src/index.ts` (agent runtime, marketplace, SDK, digital twin, model router, saas-credit-billing, revenue/management agents).
- Migrations **0193–0195** add AI-platform *persistence*, agent evaluations/feedback, and SaaS AI credit billing — the AI layer now owns tables and writes.
- A large **uncommitted** surface (`git status`: many new `intelligence/src/*.ts`, new web routes under `app/api/admin/platform/ai/*`).
- Only **4 test files** cover this fastest-growing layer.

This is scope expansion outpacing the architectural law and its test coverage. Recommendation: either (a) formally re-charter the intelligence layer as a first-class *module* with its own bounded context and enforcement, or (b) restore the read-only law and move persistence into a proper module. Do not leave it in the ambiguous middle.

## 6. Architecture Decision Records

ADR tooling is real and CI-gated (`scripts/adr-check.mjs`, `pnpm adr:check` in CI). `docs/adr/` exists. This is rare discipline and worth preserving — but confirm ADRs cover the intelligence-layer re-charter and the auth/RLS staging decisions (those are the load-bearing architectural choices a future maintainer will question).

## Recommendations (ranked)

1. **Resolve intelligence-layer status** (re-charter or restore read-only) — highest architectural leverage.
2. **Enforce schema isolation** beyond naming convention (e.g. per-module Postgres schemas or a lint/fitness check banning cross-`aura_<module>_` joins).
3. **Make the web app consume `@aura/sdk`** uniformly to close the frontend↔API contract seam.
4. **Document the outbox-relay singleton assumption** and add leader election before scaling the API horizontally.
5. **Apply projections consistently** for hot read paths (pipeline, dashboards, finance rollups).

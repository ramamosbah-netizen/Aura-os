# Codebase Map

## Workspace layout (pnpm + turbo monorepo)

Source: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`.

```
aura-os/
├── apps/
│   ├── api/          @aura/api   — NestJS 11 host; wires kernel + 18 modules (155 files, 92 controllers, 811 endpoints)
│   └── web/          @aura/web   — Next.js 16 / React 19 App Router shell (670 files, 133 pages, 162 client components)
├── core/             @aura/core  — the kernel (129 files): events, outbox, tenancy, identity, workflow, audit, DMS, builder, AI
├── shared/           @aura/shared— framework-free types, value objects, event contracts, form engine, JWT/crypto (111 files, 43 tests)
├── modules/*         18 bounded contexts (615 files, 128 tests)
├── intelligence/     @aura/intelligence — AI/agent platform (41 files, 40+ services, 4 tests)
├── infrastructure/   migrations (196 .sql) + observability (prometheus-alerts.yml) + orphan-references.json
├── packages/sdk      @aura/sdk   — spec-generated typed API client (CI drift-gated)
├── scripts/          ADR tooling, migration policy, SDK gen
└── docs/             blueprints, ADRs, architecture, 30+ dated reports, master-report (25 volumes), runbooks
```

## Layered architecture (5 layers, top reads down only)

| Layer | Location | Role | Law |
|---|---|---|---|
| EXPERIENCE | `apps/web` | Next.js UI, portals, BI | — |
| INTELLIGENCE | `intelligence/` | AI agents, forecasting, risk | *reads & proposes, never writes* (drifting — see below) |
| OPTIMIZATION | pricing / CBS / profitability | read-only calculators | — |
| MODULES | `modules/*` | 18 bounded contexts, each owns its schema + events | no cross-module DB joins; talk via events + API |
| KERNEL | `core/` | tenancy, auth/RBAC, event store + outbox, workflow, audit | foundation |

## The 18 business modules

| Module | Files | Web pages | Domain focus |
|---|---:|---:|---|
| `crm` | 98 | 19 | Leads→Opps→Quotations, accounts, contacts, forecast, pipeline, my-day |
| `finance` | 102 | 21 | GL (double-entry), AP/AR, invoices, tax, budgets, period close, PDCs, bank rec |
| `projects` | 55 | 5 | WBS/CBS, variations, schedules, cashflow, closeout |
| `tendering` | 53 | 4 | Tender lifecycle, BOQ, submissions, risk, bid review |
| `procurement` | 34 | 7 | PR→RFQ→PO, suppliers |
| `engineering` | 36 | **1** | Engineering register (backend-heavy, UI-thin) |
| `hr` | 36 | 9 | Employees, timesheets, attendance, expenses, advances, WPS |
| `contracts` | 30 | 5 | Contract 360, bonds/guarantees, payment certs, obligations |
| `doccontrol` | 25 | **1** | Submittals, transmittals (backend-heavy, UI-thin) |
| `inventory` | 24 | 6 | GRN, stock, transfers, valuation, reorder |
| `quality` | 24 | 3 | ITPs, material approvals, calibrations |
| `assets` | 16 | 2 | Asset tags, depreciation, disposal |
| `site` | 16 | 2 | Site instructions, delay logs |
| `hse` | 16 | 2 | Toolbox talks, incidents |
| `fleet` | 15 | 3 | Vehicles, traffic fines, Salik |
| `amc` | 13 | 2 | AMC contracts, PPM schedules, work orders |
| `subcontracts` | 13 | 4 | Subcontracts, variations, back-charges, retention |
| `market-intelligence` | 9 | — | (new, WIP on this branch) |

**Coverage asymmetry (the single most important structural fact):** backend file count does not predict UI depth. Engineering (36 files → 1 page) and Doc Control (25 → 1) are the extreme cases. See [`04-FRONTEND-REVIEW.md`](04-FRONTEND-REVIEW.md) and [`11-ERP-FUNCTIONALITY-REVIEW.md`](11-ERP-FUNCTIONALITY-REVIEW.md).

## Kernel (`core/src`) subsystems

| Subsystem | Key files | Purpose |
|---|---|---|
| Events | `events/{event-store,outbox-relay,postgres-event-store,in-memory-event-store}.ts` | append-only event spine + transactional outbox |
| Tenancy/RLS | `events/tenant-scoped-pool.ts`, `tenancy/tenant-context.ts` | per-query GUC binding, fail-closed |
| Identity | `identity/{auth,access,users}.service.ts`, `permissions.{guard,decorator}.ts` | JWT/JWKS, RBAC, route-derived permissions |
| Commands | `commands/{command.bus,idempotency.interceptor,lock.service}.ts` | idempotent command handling |
| Workflow | `builder/workflow-orchestrator.service.ts`, saga engine (mig 0043) | sagas, approval matrices |
| DMS | `dms/*` | document store/permissions/requirements (in-mem + pg + supabase adapters) |
| AI | `ai/{ai.service,claude-provider,local-provider,embedder}.ts` | pluggable LLM seam |
| Config | `config/{feature-flag,modules,settings}.service.ts` | tenant module toggles, flags |

## The dominant module pattern (ports & adapters)

Every module repeats a clean hexagonal shape, e.g. `modules/crm/src`:
- `domain/*.ts` — pure entities/value objects (e.g. `domain/account.ts`, `domain/quotation.ts`)
- `<entity>-store.ts` — the port (interface)
- `in-memory-<entity>-store.ts` — test/dev adapter
- `postgres-<entity>-store.ts` — production adapter (raw `pg`, parameterized)
- `<entity>.service.ts` — application service (business logic)
- `<module>.module.ts` — Nest wiring
- `index.ts` — public contract

This uniformity is the codebase's greatest maintainability asset — a reader who learns one module can navigate all 18.

## Tech stack

| Concern | Choice | Note |
|---|---|---|
| API framework | NestJS 11 | DI, decorators, Swagger |
| DB access | raw `pg` 8 (no ORM) | parameterized; deliberate, matches event-store model |
| Web | Next.js 16, React 19, App Router | server components; **no state/data lib** (SWR/query/zustand/redux = 0) |
| UI | Tailwind (globals.css) + `lucide-react` + `jspdf` | **hand-rolled design system**, no component library |
| Validation | `class-validator` / `class-transformer` (api); shared form engine | |
| Build | turbo + pnpm 11 | shared→core→modules→api order |
| Tests | Vitest + Supertest (e2e) + Playwright (web smoke) | |
| DB image | `pgvector/pgvector:pg16` | migration 0019 needs `vector` |

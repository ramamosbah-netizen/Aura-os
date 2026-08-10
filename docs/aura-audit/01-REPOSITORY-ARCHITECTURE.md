# 01 — Repository Architecture

## Monorepo layout (derived, not assumed)

```
aura-os/                      pnpm workspace + turbo
├── apps/
│   ├── api/                  NestJS host — controllers, bootstrap, cross-module wiring
│   └── web/                  Next.js App Router (151 pages, Server Components)
├── core/                     @aura/core — kernel: events, tenancy, identity, DMS, config, audit
├── shared/                   @aura/shared — domain types, forms, security, pagination, DTOs
├── modules/                  20 domain packages (@aura/crm, @aura/finance, …)
├── packages/sdk/             @aura/sdk — spec-generated API client (CI drift-gated)
├── infrastructure/migrations 220 sequential SQL migrations
├── scripts/                  ADR + migration-policy tooling
├── docs/                     ADRs, reports, master-report, this audit
├── docker-compose.yml        api + web + postgres
└── turbo.json / pnpm-workspace.yaml
```

**Evidence:** `pnpm-workspace.yaml`, `apps/api/src/app.module.ts` (imports all `@aura/*`), `ls modules`.

## Technology stack (measured)

| Layer | Technology | Evidence |
|---|---|---|
| Language | TypeScript ≥5.6, Node ≥20 (CI uses 22) | `package.json`, `.github/workflows/ci.yml` |
| Backend framework | NestJS (DI, guards, modules) | `@nestjs/*`, `apps/api/src/main.ts` |
| API style | REST, versioned `/api/v1`, OpenAPI/Swagger at `/api/docs` | `main.ts` `setGlobalPrefix`, `SwaggerModule` |
| Frontend | Next.js App Router, React Server Components | `apps/web/app`, `apps/web/lib/api.ts` |
| DB | PostgreSQL (Supabase-compatible, SSL-aware) | `core/src/events/pg-pool.ts` |
| Persistence pattern | Ports + dual adapters (Postgres / in-memory) | `*-store.ts`, `postgres-*.ts`, `in-memory-*.ts` |
| Events | In-process EventBus + Postgres outbox relay + projections | `core/src/events/*`, `OutboxRelay` |
| Auth | Bearer JWT (JWKS or HS256), ALS-bound request context | `main.ts`, `AuthService` |
| Build | turbo, tsc; SDK spec-generated | `turbo.json`, `packages/sdk` |
| Tests | Vitest (unit/module) + Supertest (API E2E) + Playwright (web, 1 spec) | CI + `apps/web/playwright.config.ts` |
| Container | Docker (api + web) + compose | `apps/api/Dockerfile`, `apps/web/Dockerfile` |

## Architectural patterns (verified)

1. **Modular monolith with enforced module boundaries.** The host composes module *service APIs*; modules never import each other's tables. Cross-context data flows through **ports** bound at the app layer (ADR-0004), e.g. Finance's `PO_MATCH_PORT`. Verified in `modules/finance/src/finance.module.ts` header comment and `search.service.ts` ("composes the modules' service APIs … never joins their tables").
2. **Ports & adapters (hexagonal).** 284 `*-store.ts` port tokens, each with a `postgres-*` and `in-memory-*` adapter. Selection by DI factory on `PG_POOL` presence.
3. **Kernel-first.** `core/` owns tenancy, identity, events, DMS, config, audit, numbering, idempotency. Modules depend on the kernel, not vice versa.
4. **Event-driven integration.** Domain events → Postgres outbox (`aura_events`) → `OutboxRelay` → in-process subscribers/projections. Dead-letter via `poison-subscriber.ts` and `0013_events_dead_letter.sql`.
5. **Governance-as-code.** 19 ADRs with a CI integrity check (`pnpm adr:check`), a migration-policy check (`scripts/migration-policy-check.mjs`), and architecture fitness tests (`apps/api/src/architecture.fitness.test.ts`, `error-taxonomy.fitness.test.ts`).

## Bootstrap chain (`apps/api/src/main.ts`) — `VERIFIED_IMPLEMENTED`

`create(AppModule)` → global prefix `/api/v1` → CORS → shutdown hooks → global filters (`AllExceptionsFilter`, `AccessDeniedFilter`) → global `ValidationPipe` (transform + whitelist) → Swagger → **auth posture gate** (fatal in prod if open) → **RLS posture gate** (fatal in prod if bypassing) → HTTP metrics middleware → **migration deploy-gate** (503 when schema behind) → OTLP metrics pusher → per-request middleware (idempotency enforcement, JWT verify, correlation ID, tenant ALS `tenant.run(...)`).

## Strengths

- Clean separation of host / kernel / modules; boundaries are *enforced*, not merely documented.
- The persistence seam makes the whole system runnable with zero infra (tests, local dev) yet production-real with a `DATABASE_URL`.
- Security and operational concerns are centralized in the bootstrap and kernel rather than scattered.

## Weaknesses / risks

- **Modular monolith, single deployable.** No independent scaling of hot modules; a runaway query in one module shares the process. Acceptable at current scale, a scaling ceiling later (`16-PERFORMANCE-SCALABILITY.md`).
- **In-process event bus.** Reactors run in the same process as the API; there is an outbox for durability but not a distributed broker. Cross-instance ordering/coordination is not addressed (`03`, `16`).
- **Depth asymmetry** between front-half (CRM/commercial/finance) and back-half (engineering/site/quality/HSE) modules (`02`).

**Overall architecture score: 86/100** — genuinely strong design; the deductions are for the single-process event/deploy model and depth asymmetry, not for correctness.

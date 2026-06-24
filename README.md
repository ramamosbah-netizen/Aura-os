# AURA OS

A Tier-1 ERP **Operating System** for Contractors · MEP · ELV · Facilities Management · AMC — built as a clean, event-driven **modular monolith** (microservices-ready).

> Greenfield rebuild that reuses the *ideas and corrected logic* of 7 prior ERP projects, with **no legacy code**. Full design in [`docs/`](docs/).

## Architecture (5 layers)

```
EXPERIENCE     apps/web (Next.js) · portals · mobile · BI
INTELLIGENCE   intelligence/  (AI agents, forecasting, risk — read-only)
OPTIMIZATION   pricing (IEC) · CBS · profitability — read-only
MODULES        modules/*  (16 bounded contexts, each owns its schema + events)
KERNEL         core/  (tenancy · auth/RBAC · event store + outbox · workflow · audit)
```

**Laws:** a module owns its data; no cross-module DB joins; modules talk only via **events + API contracts**; the intelligence layer **reads and proposes, never writes** core.

## Workspace

| Path | Package | Role |
|---|---|---|
| `apps/api` | `@aura/api` | NestJS host — wires the kernel + modules |
| `apps/web` | `@aura/web` | Next.js experience shell *(from next increment)* |
| `core` | `@aura/core` | Kernel: event store, outbox, tenancy |
| `shared` | `@aura/shared` | Framework-free types, value objects, event contracts |
| `modules/*` | — | Business modules *(added from T1)* |

## Develop

```bash
pnpm install
pnpm build          # turbo: builds shared → core → api
pnpm --filter @aura/api start:dev   # API on http://localhost:4000/api
```

## Docs

- [`docs/AURA-OS-V2-BLUEPRINT.md`](docs/AURA-OS-V2-BLUEPRINT.md) — clean-architecture blueprint
- [`docs/AURA-OS-V2-MODULE-MAP.md`](docs/AURA-OS-V2-MODULE-MAP.md) — Tier-1 module/page/UI scope
- [`docs/AURA-0.2-MASTER-BLUEPRINT.md`](docs/AURA-0.2-MASTER-BLUEPRINT.md) — what each source repo contributed

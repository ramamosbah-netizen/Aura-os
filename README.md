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
pnpm auth:configure-local   # generates the local JWT + master-admin secrets and .env.local
pnpm build                  # turbo: builds shared → core → api
pnpm --filter @aura/api start:dev   # API on http://localhost:4000/api
```

Run `pnpm auth:configure-local` before you trust anything you see locally. Measured behaviour of
an install that skips it (no `.env.local`, no secrets):

| | Result |
|---|---|
| `GET /auth/status` | `{"enabled":false}` — no verifier is configured |
| `POST /auth/login` | **403** `login (dev token mint) requires AUTH_JWT_SECRET` |
| `GET /crm/accounts` with **no credentials** | **200** |

So the failure mode is not "locked out", it is the opposite: an unauthenticated local API that
answers every business route as the dev actor, and a login route that cannot issue a session at
all. Permissions, tenant isolation and approval limits are all inert in that state, which makes it
a bad mirror of production to develop against.

After the bootstrap, `AUTH_REQUIRED=true`, login works, and the master-administrator grant is
loaded — verified end to end: sign in as `u-admin`, then `GET /crm/accounts` → 200 as an
*authorized* read. The command is idempotent and never overwrites an existing secret. It prints
the *path* to the generated password file, not the password — read it from
`.aura-storage/secrets/master-admin-password` to sign in as `u-admin`.

Secrets are written to `.aura-storage/secrets/` (gitignored) and referenced from
`apps/api/.env.local` as `*_FILE` paths, so no credential is ever stored in a committed file.
`AUTH_LOCAL_LOGIN_USERS` in that file restricts local login to `u-admin`; add identities to it if
a second local actor is needed (e.g. a maker-checker pair).

## Docs

- [`docs/AURA-OS-V2-BLUEPRINT.md`](docs/AURA-OS-V2-BLUEPRINT.md) — clean-architecture blueprint
- [`docs/AURA-OS-V2-MODULE-MAP.md`](docs/AURA-OS-V2-MODULE-MAP.md) — Tier-1 module/page/UI scope
- [`docs/AURA-0.2-MASTER-BLUEPRINT.md`](docs/AURA-0.2-MASTER-BLUEPRINT.md) — what each source repo contributed

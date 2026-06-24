# Report — Phase 0b.2: Postgres event store + transactional outbox

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** Phase 0b step 2 of the kernel.

> The durable spine. Replaces the in-memory stand-in with a Postgres ledger + an outbox relay — built `pg`-direct because an *atomic* outbox cannot be done over REST.

---

## What was built

**`@aura/core` — event-spine adapters** (`src/events/`):
- `pg-pool.ts` — `createPgPool()` builds a `pg.Pool` from `DATABASE_URL`, or returns **null** when it's absent (lazy: no socket until first query; SSL on for Supabase, off for localhost). `PG_POOL` DI token.
- `postgres-event-store.ts` — `PostgresEventStore implements EventStore`:
  - `append(events)` — own `BEGIN/COMMIT`, multi-row insert into `public.aura_events` with `ON CONFLICT (id) DO NOTHING` (idempotent).
  - `appendWithClient(client, events)` — insert on a **caller-owned transaction**: the atomic-outbox entry point so a module can write its business rows **and** the event in one transaction (no lost / phantom events). This is *why* it needs a direct `pg` connection.
  - `list(filter)` — newest-N by `created_at`, returned oldest→newest to match the in-memory store's contract.
  - Exports `rowToEvent` + `EVENT_COLUMNS` (shared with the relay).
- `outbox-relay.ts` — `OutboxRelay` (`OnModuleInit`/`OnModuleDestroy`): polls `aura_events WHERE processed_at IS NULL` with `FOR UPDATE SKIP LOCKED` (multi-instance safe), publishes each to the `EventBus`, then stamps `processed_at`. **At-least-once, never a lost event.** Handler failure records `processing_error` and retries next tick. **Idle no-op when there's no pool**, so the API still boots.

**`CoreModule`** — the event store is now chosen at boot from `DATABASE_URL`: `PostgresEventStore` + relay when set, `InMemoryEventStore` otherwise. One DI graph, two backends.

**`apps/api`**:
- `main.ts` — loads `apps/api/.env.local` (dotenv) before the kernel reads `DATABASE_URL`; `enableShutdownHooks()` so the relay clears its timer.
- `scripts/migrate.mjs` — idempotent migration runner: applies `infrastructure/migrations/*.sql` in order, tracks them in `public.aura_migrations`, one transaction per file. Wired as `pnpm db:migrate`.

**Migration** `0001_kernel_events.sql` — already written (append-only `aura_events` ledger + outbox columns + indexes + RLS-locked). Header updated to point at `pnpm db:migrate`.

## Verified

- `pnpm build` → **shared → core → api all compile** (incl. the pg store/relay/pool, dotenv wiring).
- `pnpm test` → **12/12 vitest tests pass** (identity suite — no regression).
- **API boots** (`node dist/main.js`, no `DATABASE_URL`): `CoreModule dependencies initialized` (DI graph resolves), `OutboxRelay … idle (events use the in-memory store)`, `Nest application successfully started`. The boot-safe fallback is real.
- `pg@8.22`, `dotenv@16.6` installed; esbuild build re-approved (`allowBuilds`/`onlyBuiltDependencies`).

## ✅ Verified live — dedicated Supabase project

aura-os was pointed at its **own** Supabase project (`jzhvmempkpgitmfunoyr`), **not** NEW-ERP's shared DB, via the session-mode pooler (port 5432). Round-trip proven:
- `pnpm db:migrate` → applied `0001` (table `aura_events` created, recorded in `aura_migrations`).
- Boot with `DATABASE_URL` set → `OutboxRelay: Relay started` (no longer idle).
- `POST /api/events` → event `b8096ae0…` created; `GET /api/events` → **read back from Postgres**.
- Relay log `Relayed 1 event(s)` + subscriber log `▶ kernel.smoke.tested`.
- Direct DB check: row persisted, `processed_at = 2026-06-24T08:05:49Z`, `processing_error` none.

Emit (08:05:47Z) → relay (08:05:49Z) confirms **persist-then-relay**, not inline publish. The kernel's durable event spine is real.

## Decisions

- **`pg`-direct, not supabase-js/REST** — a transactional outbox requires the event insert to share the business transaction; PostgREST makes each call its own transaction, so REST can only ever be best-effort. Direct `pg` is the only correct substrate for the guarantee. This is the "build the kernel right once" call.
- **Boot-safe by design** — no `DATABASE_URL` ⇒ in-memory store + idle relay, so dev/CI never needs a database.
- **Dedicated Supabase project** (`jzhvmempkpgitmfunoyr`) — aura-os no longer shares NEW-ERP's DB, so there's no collision risk. `aura_*` table prefix is kept for now; a clean dedicated schema (schema-per-module) is a low-priority follow-up.
- **Relay holds the row lock across in-process `publish`** — fine for fast in-process handlers; a dead-letter cap (max attempts) is a follow-up once modules emit real events.

## Next

Event spine done & live-verified → **AI Provider Layer → `core`** (port `ai-provider` in as kernel, per Architecture v2), then the **DMS / Workflow / Integration** skeletons to finish Phase 0b.

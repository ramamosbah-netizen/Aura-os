# Runbook — Migration deploy-gate (Roadmap R2 / G-P0-2)

**Status:** shipped. The API refuses to serve business routes against a schema that is behind its migrations.

## Why this exists

The `assigned_to` silent-500 incident: code shipped that expected a column the running database
hadn't been migrated to have, so a business handler 500'd deep in the stack with no clear cause.
The deploy-gate makes a stale schema **fail fast and visible** at the edge instead.

## What it does

At boot, `MigrationGateService` (`apps/api/src/health/migration-gate.service.ts`) compares:
- the migration files shipped with this build — `infrastructure/migrations/*.sql`; and
- the applied ledger — `SELECT filename FROM public.aura_migrations` (what the migrate runner records).

If any on-disk migration is **not** in the ledger, the schema is behind the code → the app is
**degraded**:
- **`GET /api/v1/health`** returns **503** with a loud body: `{"status":"degraded","schema":{"upToDate":false,"pending":[…],…}}`.
- **Business routes** are refused with **503** `{"code":"SCHEMA_MIGRATION_PENDING","pending":[…]}` (a
  middleware in `main.ts`, ahead of auth), rather than 500-ing in a handler.
- **`/api/v1/health`, `/api/v1/metrics`, `/api/docs`** stay reachable so the degraded state is observable.

Fail-open (NOT degraded) for the "can't determine" cases — no `DATABASE_URL` (in-memory dev/test,
nothing to be behind) and migrations dir not locatable — so the gate never bricks a legitimately
schemaless run. Fail-closed (degraded) for the one thing it guards: files present the DB hasn't applied
(including the `aura_migrations` ledger not existing yet = nothing migrated).

The check runs **once at boot** and is cached: deploys migrate-before-serve, so the boot snapshot is
the contract. Recovery is: apply migrations, then restart.

## Deploy order (migrate-before-serve)

1. Run the migration job first: `node apps/api/scripts/migrate.mjs` (or `docker run … node scripts/migrate.mjs`).
2. Only then start / roll out the API. New instances boot healthy; if a rollout starts an instance
   before migrations are applied, that instance is degraded (503) and out of rotation until migrated.

The image ships the migrations dir (`Dockerfile` copies `infrastructure/`), so the gate can read the
expected set at runtime. Override the location with `MIGRATIONS_DIR` if your packaging differs.

## What "degraded" looks like

```
$ curl -s -o /dev/null -w '%{http_code}\n' http://api/api/v1/health
503
$ curl -s http://api/api/v1/health
{"status":"degraded","service":"aura-os-api","schema":{"upToDate":false,"applied":163,"onDisk":164,"pending":["0164_rls_activation_closure.sql"],"reason":"1 migration(s) pending"}}
$ curl -s -X POST http://api/api/v1/crm/accounts -d '…'
{"statusCode":503,"error":"Service Unavailable","code":"SCHEMA_MIGRATION_PENDING","message":"database schema is behind the application; 1 migration(s) pending","pending":["0164_rls_activation_closure.sql"]}
```

Boot log carries: `SCHEMA BEHIND CODE — N pending migration(s): … Business routes are refused (503) until migrations are applied.`

## Recovery

1. Apply the pending migrations: `pnpm --filter @aura/api db:migrate` (or the migration job/image).
2. Restart the API instance(s). Health returns `200 ok`, business routes resume.

## Guarantees & tests

- Unit: `apps/api/src/health/migration-gate.service.test.ts` — pending ⇒ degraded + names the file;
  all-applied ⇒ ok; missing ledger ⇒ fully behind; no pool ⇒ inert.
- CI (`deploy-readiness`): un-records the latest migration in the ledger, boots the built API, and
  asserts `/health` 503 degraded **and** a business route 503 `SCHEMA_MIGRATION_PENDING`, then restores
  the ledger. CI also already runs the migration job **before** booting the API (migrate-before-serve).

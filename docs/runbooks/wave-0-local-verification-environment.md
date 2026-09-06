# Wave 0 — Local verification environment (AURA-ENV-001)

Closes the P0 from the master audit: **local development pointed at the shared remote Supabase
project with auto-migration armed**, so editing a migration while `nest --watch` ran would apply it
to shared infrastructure unprompted.

Wave 0 also dissolves the two limitations that capped the audit:

| Limitation | Removed by |
|---|---|
| **L-2** — live DB state NOT PROVEN | a disposable local PostgreSQL you may migrate from zero and prove RLS against |
| **L-1** — browser journeys NOT VERIFIED | an authenticated Playwright run against that database |

---

## Step 0 — done already (no engine required)

`AUTO_MIGRATE=off` is set in `apps/api/.env.local`. The danger is disarmed **now**, before any of
the rest of this runbook:

```
shouldAutoMigrate()  →  false   (apps/api/src/health/migration-gate.service.ts:20)
```

Migrations are applied only by an explicit `pnpm db:migrate`. A pending migration makes the API
report `degraded` and refuse business routes — the designed fail-safe — instead of silently
mutating the database.

Backup of the previous file: `apps/api/.env.local.wave0-backup`.
Revert by deleting the `AUTO_MIGRATE=off` line.

> This step alone removes the P0. Everything below adds the *verification* capability.

## Step 1 — a PostgreSQL engine (BLOCKED — needs a decision)

This machine has **no PostgreSQL engine**: Docker is installed but its daemon is not running,
Docker Desktop is not at the default path, and there is no native PostgreSQL or `psql`.
`winget` and `choco` are both available.

Pick one:

| Route | Command | Notes |
|---|---|---|
| **A. Docker Desktop** (recommended) | start Docker Desktop, then `docker compose -f docker-compose.dev.yml up -d` | Matches CI exactly (`pgvector/pgvector:pg16`). `tmpfs` storage means the data is destroyed on `down` — disposability by construction. |
| **B. Native PostgreSQL 16** | `winget install PostgreSQL.PostgreSQL.16` then create the `aura` role/database | Needs the `vector` extension for migration 0019. |
| **C. Postgres.app / portable** | any PG 16 with `pgvector` | Provisioner is engine-agnostic. |

Nothing was installed on your behalf.

## Step 2 — provision

```bash
LOCAL_DATABASE_URL=postgres://aura:aura@localhost:55432/aura?sslmode=disable \
  node apps/api/scripts/provision-local-db.mjs
```

The provisioner does, in order:

1. **refuses any non-local host** — hard guard, no override flag;
2. **refuses a database that already holds `aura_*` tables** unless it is already marked disposable;
3. applies the **full migration chain from zero** (all 281);
4. re-runs it and asserts **`0 applied`** — idempotency;
5. **counts the ledger in the local database and asserts it matches the files on disk** — proof the
   chain landed *here*, not merely that some database is current;
6. activates **`aura_app`** with LOGIN and asserts it is `NOSUPERUSER` + `NOBYPASSRLS`;
7. marks the database **`e2e-disposable`** in `public.aura_environment`;
8. runs **`rls-fitness.mjs`** (every tenant-scoped table has RLS + FORCE + a policy) and
   **`rls-isolation-test.mjs`** (cross-tenant access denied under a non-bypass role);
9. seeds the **e2e actors** — the same two roles and three grants CI's TIER-3 job creates, without
   which the browser suite in Step 4 fails on setup rather than on product behaviour.

Steps 3–8 are exactly what CI's `deploy-readiness` job proves, run locally; step 9 mirrors the
browser job's own seeding.

> **Why step 5 exists.** An earlier version of this runbook claimed the provisioner "reads only
> `LOCAL_DATABASE_URL`, so it cannot be aimed at the shared project by copying the wrong variable."
> That was true of the script and false of the *children it spawns*. `migrate.mjs` loads
> `apps/api/.env.local` through dotenv, and dotenv fills in any variable that is **absent** — so
> passing the child only `DATABASE_URL` left `MIGRATION_DATABASE_URL` empty, dotenv supplied the
> Supabase one from `.env.local`, and `migrate.mjs` prefers it. The whole chain pointed at the
> shared project, and the idempotency assertion passed against it.
>
> Every child is now handed both variables explicitly. Step 5 exists because that is still an
> assumption about environment plumbing, and this is the one place in the repo where an assumption
> is not good enough: it measures the database the script itself connected to.

## Step 3 — point the API at it

In `apps/api/.env.local`:

```
DATABASE_URL=postgres://aura_app:aura_app_local@localhost:55432/aura?sslmode=disable
MIGRATION_DATABASE_URL=postgres://aura:aura@localhost:55432/aura?sslmode=disable
AUTO_MIGRATE=off
AUTH_DEV_ADMIN_USER=u-admin,u-e2e-checker,u-e2e-viewer
```

The two extra users are the actors step 9 seeded. They hold deliberately narrow grants — they are
not admins — but they must be able to *sign in*, or the specs that use them 401 before reaching the
behaviour they exist to prove. CI boots its API with the same list.

Restart the API. `GET /api/v1/health` must report:

```json
{ "environment": "e2e-disposable", "schema": { "upToDate": true, "applied": 281 } }
```

`environment: "e2e-disposable"` is the marker the browser suite requires. A development or
production database has never been marked and answers `null`, so it is refused by default — nobody
has to remember anything.

## Step 4 — browser proof (removes L-1)

```bash
E2E_DISPOSABLE_DB=1 pnpm --filter @aura/web e2e
```

The suite refuses to start unless **both** are true: `E2E_DISPOSABLE_DB=1` *and* the database says
`e2e-disposable`. Two independent facts, because one is a claim by whoever typed the command.

`e2e/global-setup.ts` signs in through the **real login form** once and shares the session cookie,
so authentication is handled by the suite — no interactive password entry.

Only after this can a workflow row move from `STATICALLY COMPLETE / BROWSER NOT VERIFIED` to a
proven result.

## Why the shared database must never be the target

From `e2e/global-setup.ts`, recording what already happened once:

> local runs drove the API on :4000, which `apps/api/.env.local` points at Supabase, so ten days of
> suite runs accumulated there — and it was not merely untidy: the Operations centre renders
> `slice(0, 8)` of active projects sorted by title, so accumulated projects pushed a spec's own to
> position 9 and failed it. **The shared database authored a test result.**

## Rollback

| To undo | Do |
|---|---|
| auto-migrate disarm | delete `AUTO_MIGRATE=off` from `apps/api/.env.local`, or restore `apps/api/.env.local.wave0-backup` |
| local database | `docker compose -f docker-compose.dev.yml down -v` |
| everything | the three added files are `docker-compose.dev.yml`, `apps/api/scripts/provision-local-db.mjs`, this runbook |

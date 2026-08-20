# Browser E2E — where these tests may run

This suite is **destructive**. It registers users, sets passwords, files daily reports, sends mail,
opens conversations and posts into them. Where it points matters as much as what it asserts.

## The three environments

| environment | backend | who runs it | may this suite write there? |
|---|---|---|---|
| **TIER-2** | in-memory API (`DATABASE_URL=` empty) | CI `web smoke`, local | **yes** — nothing durable exists |
| **TIER-3** | disposable PostgreSQL, created per run | CI `web smoke TIER-3` | **yes** — created and destroyed by the job |
| **Supabase dev** | the shared development database | you, by hand, and the app during development | **never** |

Supabase dev is a **live development environment**. Real projects, reports and mail are created
there by hand while AURA is being built, and that is exactly what it is for. The rule is not "keep
it pristine" — it is that an automated destructive suite must never point at it.

## Why the rule exists

Every local run drove the API on `:4000`, and `apps/api/.env.local` points that API at Supabase. Ten
days of suite runs accumulated there: 29 projects, 53 chat messages, 19 mails, 21 daily reports,
permits, drawings, NCRs.

It was not merely untidy. The Operations command centre renders `slice(0, 8)` of active projects
sorted by title. With 29 accumulated projects, a spec's own project sorted to position **9** and the
spec failed — on a clean database the identical commit passed. The shared database authored a test
result, and cost an afternoon of investigation into a defect that did not exist.

## How the rule is enforced

`global-setup.ts` refuses to start against a database-backed API unless **two independent facts**
both hold:

1. `E2E_DISPOSABLE_DB=1` — the runner asserts the target is disposable.
2. `health.environment === 'e2e-disposable'` — the database says so about itself.

(1) alone is only a declaration by whoever typed the command: set it beside the wrong
`DATABASE_URL` and it is still true and still wrong. (2) is read from `public.aura_environment`, a
table **no migration creates** — so a development or production database answers `unmarked` by
never having been marked. Absence is the safe default, and nothing has to be remembered to keep it
that way. Only a provisioning step that deliberately marks a throwaway satisfies it.

The API *reports* the marker and never enforces it. It serves whatever database it is pointed at;
the refusal belongs to the suite that would do the writing.

## Running locally

Against an in-memory API — the normal case, no flags needed:

```bash
DATABASE_URL= MIGRATION_DATABASE_URL= AUTH_STATE_PERSISTENCE= AUTH_DEV_PASSWORD_FILE= AUTH_JWT_SECRET_FILE= AUTH_SEED_DEV_ADMIN=true AUTH_DEV_ADMIN_USER=u-admin,u-approver AUTH_DEV_PASSWORD=e2e-password AUTH_JWT_SECRET=e2e-only-not-a-real-secret RATE_LIMIT_MAX=100000 PORT=4100 node apps/api/dist/main.js

AURA_API_URL=http://localhost:4100 E2E_USERNAME=u-admin E2E_PASSWORD=e2e-password E2E_ALT_USERNAME=u-approver pnpm --filter @aura/web e2e
```

`AURA_API_URL` is required: without it the specs that call the API directly are never authenticated
and fail as 401s that read like product bugs.

Clearing the two `_FILE` variables is not decoration. `apps/api/.env.local` sets
`AUTH_DEV_PASSWORD_FILE`, and `readSecret()` prefers `<NAME>_FILE` over `<NAME>` — so an inline
`AUTH_DEV_PASSWORD` is silently ignored, the seeder uses the file's password, and global setup
fails with `Invalid credentials` against an API that is working perfectly.

Port 4100 rather than 4000 for the same reason the guard exists: 4000 is where the everyday API
runs, and that one is pointed at Supabase.

Against your own throwaway PostgreSQL, mark it first:

```sql
CREATE TABLE IF NOT EXISTS public.aura_environment (marker text PRIMARY KEY);
INSERT INTO public.aura_environment (marker) VALUES ('e2e-disposable') ON CONFLICT DO NOTHING;
```

then run with `E2E_DISPOSABLE_DB=1`. Do not mark the shared database to make a run go through —
that is the one thing this guard exists to prevent.

## Writing fixtures

Seed through the API and use the ids it returns (`fixtures.ts`), rather than inventing values:

- A synthetic id such as `projectId: 'e2e-proj'` is a map key in-memory and
  `400 invalid input syntax for type uuid` against a real schema. That difference hid eleven
  failures.
- A locally generated UUID satisfies the column type while pointing at a project that does not
  exist.

## Run isolation

A disposable database is not the same as an empty one: the suite fills it as it runs, and it can be
run twice. Three rules follow, each of which has already been broken.

**Scope what you create to the run.** `runId()` is stamped once in global setup and inherited by
every worker; `scoped('Daily Report')` gives a name unique to the run, and every record from one run
carries the same token — which is also what makes a row attributable afterwards, when deciding
whether it came from a test or from a person.

**Own what you constrain.** `offline-sync` used to create a project only if the instance had none,
and otherwise file its reports against whatever the picker listed first. Against a shared database
that put test reports on somebody's real project; against any database the second run collided,
because a project may hold only one daily report per day. A spec that writes something the parent
record constrains must create its own parent — `createProject`, not `projectFixtureId`.

**Never depend on position.** Do not assume a table is empty, that your record is the newest, or
that it lands in the first N results. The Operations command centre renders `slice(0, 8)` of active
projects sorted by title; with 29 accumulated, a spec's project sorted to position 9 and failed
against a page that was working perfectly. Select by name or id, not by index — and where a capped
list genuinely is the thing under test, check the precondition out loud (see
`project-operations-workspace.spec.ts`) so the failure names the environment instead of implying a
broken feature.

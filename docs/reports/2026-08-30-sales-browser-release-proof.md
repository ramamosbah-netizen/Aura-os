# Sales Browser Release-Proof Gate

**Date:** 30 August 2026
**Scope:** Browser/Playwright runtime proof for the additive Sales & Commercial surface
**Safety rule:** shared Supabase development data must not be used or mutated

## Attempted environment

- The running AURA API reports `schema.applied = 271` and `schema.upToDate = true`.
- Its environment marker is **unmarked** (`health.environment = null`), and its configured database
  is the shared Supabase development database.
- The local PostgreSQL Windows service belongs to another installed product and was not used.
- A disposable PostgreSQL cluster was created in the workspace on port `55432`, but migration
  application stopped at `0019_intelligence_pricing_autonomy.sql` because the local server does not
  provide the required `vector` extension. The cluster was stopped and removed; no shared data was
  touched.

## Playwright safety result

The repository Playwright global setup was invoked with `E2E_DISPOSABLE_DB=1` against the running
API. It correctly refused to start at `apps/web/e2e/global-setup.ts:78` because the database marker
was unmarked:

```text
runner says disposable: true
database says disposable (health.environment): unmarked
REFUSING TO RUN
```

This is a **BLOCKED — environment safety gate** result, not a Product or Browser test failure. No
Sales Browser test ran and no mutation was attempted.

## Release matrix

| Evidence | Result | Notes |
|---|---|---|
| Disposable PostgreSQL | **BLOCKED** | Local disposable cluster cannot complete migration 0019 without pgvector; shared Supabase is prohibited. |
| Migrations 0001–0271 for Browser target | **BLOCKED** | Only 0001–0018 applied in the temporary cluster before the required extension failure. |
| Browser/Playwright Sales journey | **BLOCKED** | Global setup refused the unmarked shared database before any spec executed. |
| Navigation/360 assertions | **NOT RUN** | Must run after an isolated database is provisioned. |
| Shared Supabase safety | **PASS** | The safety gate prevented access; no shared records were changed. |
| CI | **NOT RUN** | Browser prerequisite is not available locally; CI remains a separate gate. |

## Required next environment

Run the existing TIER-3 workflow/job with a disposable PostgreSQL image that includes pgvector (or
an equivalent isolated Supabase/PostgreSQL target), mark it `e2e-disposable`, apply all migrations,
then execute the Sales Browser journeys. Do not mark the shared development database or reuse it as a
workaround.

## Decision

```text
Browser Runtime = BLOCKED — disposable isolated PostgreSQL unavailable
Sales Browser Release-Proof = NOT VERIFIED
Phase 3A.4 / 3A.5 authorization = NOT OPENED
Project / Phase 3B = unchanged and deferred
```

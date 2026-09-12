# TC-GATE-21-MIGRATION-ROLE-RLS-CLOSURE

**Verdict: CLOSED / VERIFIED.** **No migration.** `rls-fitness` unchanged at **254 / 254**.

**Scope taken:** the hazard TC-GATE-20 recorded — that a data backfill can report success while
changing nothing. Discovery-first, as directed: establish how migrations actually run before
proposing a mechanism.

---

## 1. What discovery established

**The claim was in the runbook, in writing.** `docs/runbooks/rls-tenant-isolation.md` described
`MIGRATION_DATABASE_URL` as *"the owning role — may create, **and bypasses RLS**"*.

That was true when it was written. The same document records why it stopped being true:

> **`FORCE ROW LEVEL SECURITY` was set on 0 of 149** tenant-scoped business tables. Without FORCE,
> RLS does not apply to a table's owner either.

**FORCE is now on 254 of 254.** The programme that hardened RLS is the same programme that
invalidated the assumption every migration rests on, and nothing connected the two.

**Nothing checks.** `migrate.mjs` derived the role name with a regex **over the connection string**
and printed it. It never asked the database anything: no `rolsuper`, no `rolbypassrls`, no
`row_security`. A cosmetic label where a capability check was assumed to be.

**Neither environment we run can detect it.**

| Where | Migration role | Superuser? | Would the hazard show? |
|---|---|---|---|
| local disposable | `aura` | **yes** — measured `rolsuper: true, rolbypassrls: true` | no |
| CI (`ci.yml`) | `aura` via `POSTGRES_USER: aura` on the postgres service | **yes** — docker image default | no |
| staging / production | operator-configured | **unknown — see §5** | — |

**The blast radius is wider than migrations.** Five operational scripts act as the migration role
across every tenant with no tenant bound. One of them is read-only and is the most quietly dangerous
of the set: **`orphan-scan` seeing nothing reports a clean scan.**

---

## 2. The measurement

Reasoning about RLS is how this was got wrong the first time, so the hazard was **measured**: a
`NOSUPERUSER NOBYPASSRLS` role was created, made to **own** a table shaped like every business table
here (`ENABLE` + `FORCE` + the tenant policy), given three rows, and then asked to do what a
migration does — act with no tenant bound.

```
migration role under test: { rolsuper: false, rolbypassrls: false }
rows seeded (tenant bound): 3

A. the house-pattern backfill, exactly as 0239/0249/0270/0305 write it
   rows updated: 0
   error raised: none

B. the same statement under SET LOCAL row_security = off
   ERROR RAISED: query would be affected by row-level security policy for table "g21_probe_rows"
```

**Seven data backfills are written in shape A** — `0239`, `0241`, `0249`, `0267`, `0269`, `0270` and
`0305`. On a deployment whose migration role is an unprivileged owner, every one of them printed
`✓ done` over untouched data.

---

## 3. The mechanism: works, or fails loudly

`SET row_security = off` is the whole answer, and it is the right one for two reasons rather than one:

1. It makes PostgreSQL **raise instead of filter** — the silent 0 rows becomes an error that names
   the table.
2. It is defined to have **no effect on roles that bypass every policy**. So on every deployment
   where the work was already correct, this guard is a no-op and cannot break anything.

That is exactly the contract asked for: *the backfill either actually works or fails loudly; silent
0 rows is forbidden.*

It is applied in **one place** — `apps/api/scripts/lib/cross-tenant-session.mjs` — which also
**queries** the role's real posture and prints it, replacing the regex that guessed at it. Five
scripts open their session through it:

| Script | Why it must |
|---|---|
| `migrate.mjs` | applies data backfills across every tenant |
| `archive-events.mjs` | a retention sweep DELETEs across every tenant |
| `merge-duplicate-accounts.mjs` | rewrites account references across tenants |
| `backfill-pre-award.mjs` | a backfill INSERTs across every tenant |
| `orphan-scan.mjs` | **a scan that sees nothing reports a false CLEAN** |

`rls-isolation-test.mjs` is deliberately excluded — it exists to *observe* RLS filtering, and the
guard would break the thing it proves. `rls-fitness.mjs` reads `pg_catalog`, which carries no policy.

---

## 4. Keeping it honest

`migration-role-scripts.fitness.test.ts` derives every script that reads `MIGRATION_DATABASE_URL`
and asserts the list against a **registry that states, per script, whether the guard is required and
why**. A new operator script cannot quietly join the set: the list stops matching until someone
classifies it. `false` is a claim with its reason attached, not an exemption.

`migration-role-rls.pg-int.test.ts` pins the behaviour the mechanism depends on, in both directions —
the silent failure, and the raise. Including the half that matters for confidence: on a privileged
role the guarded statement still updates all three rows across tenants, so the guard demonstrably
costs nothing where it was already fine.

---

## 5. What this gate could NOT establish, stated plainly

**I could not observe a staging or production deployment.** There is no access to one from here, and
changing shared infrastructure is out of bounds. So this gate proves the hazard is *real and
reachable*, and makes it *impossible to hit silently* — it does not prove whether any particular
deployment was affected.

**That question is now one query**, run on the migration connection:

```sql
SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

If both flags are false, that deployment's seven backfills did nothing, and the fix is to grant the
migration role `BYPASSRLS`. After this gate, the same situation announces itself: the next migration
run fails with a row-level-security error naming the table.

**The operator instruction that matters** is recorded in the runbook: if a migration now fails that
way, **do not bind a tenant to make it pass.** That would turn a silently empty cross-tenant backfill
into a silently partial one, which is worse.

---

## 6. The proof

| Check | Result |
|---|---|
| `migration-role-rls.pg-int` — a real `NOSUPERUSER NOBYPASSRLS` owner of a FORCE-RLS table | **4 passed** |
| `migration-role-scripts.fitness` — the registry against what is on disk | **24 passed** |
| `migrate.mjs` against the disposable database | 305 applied, role posture reported correctly |
| `orphan-scan.mjs` with the guard | runs clean, 0 orphans |
| `rls-fitness.mjs` (deliberately unguarded) | still passes — 254 / 254 |
| `@aura/api` | **440 passed** (was 416) |
| `pnpm test` — every package | 51 / 51 tasks |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean, 27 / 27 |
| `migrations:check` | 305 files, sequential, `@DOWN` present |
| e2e — **full suite**, 54 specs | **150 passed**, 6 skipped, 3 failed — the same three baselined against `main` in TC-GATE-19 |

**No runtime code changed in this gate** — the diff is five operator scripts, one new helper, two
tests and the runbook. The e2e suite is run anyway, because TC-GATE-20 ended with thirty-one red
tests caused by a full disk, and "it cannot have broken anything" is the belief that costs the most.

---

## 7. Known limitations

1. **No staging/production observation** (§5). The requirement is documented and self-announcing, not
   verified against a live deployment.
2. **The seven historical backfills are not re-run.** If a deployment was affected, they need
   re-applying by hand after the role is fixed — this gate does not detect or repair past damage, and
   `aura_migrations` already records them as applied.
3. **Development proof scripts are excluded by category.** Twelve `*-proof.mjs` scripts read
   `MIGRATION_DATABASE_URL` and run against disposable databases. They are listed in the registry
   rather than pattern-matched, so promoting one to an operational script forces a decision.
4. **The guard is per-script, not per-connection.** Nothing stops a future script from opening its own
   `pg.Client` and skipping the helper — the fitness test is what catches that, and it catches it by
   filename, not by connection.
5. **`ALLOW_RLS_BYPASS` still governs the RUNTIME role** and is untouched here; this gate is only
   about the migration/operator role.

---

## 8. Gate-22 handoff

Per the agreed plan, Gate 22 is **per-handler event delivery / retry isolation** — the hazard
TC-GATE-20 recorded as its most serious unfixed finding:

> `EventBus.publish` is `Promise.all` over every handler and the relay retries the whole EVENT, so a
> `retryable` handler's throw re-runs its siblings. `inventory.stock.movement_recorded` has four
> subscribers, one already retryable, and one of the others posts a GL journal with no idempotency
> key.

Discovery first, then the smallest correct architecture, with the GL journal case as a primary
regression proof.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 22 not started.

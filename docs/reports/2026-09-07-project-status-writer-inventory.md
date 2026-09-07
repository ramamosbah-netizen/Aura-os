# `projects.status` — writer inventory and bypass audit

**Date:** 2026-09-07 · **Branch:** `feat/master-task-3-closeout-readiness` · **Scope:** §2 Project Lifecycle

## Why this exists

`aura_projects_projects.status` is `text not null default 'planned'` with **no CHECK constraint**.
Gating the transitions is therefore not sufficient on its own: if any other writer can put a value
into that column, the transition authority is advisory. This audit enumerates every writer, says
whether it goes through the authority, and shows what was actually in the column.

Method: every reference to the table and to the store token was enumerated (not sampled), each
writer read, and the live database queried directly.

## The column today

```
status | count
-------+------
active |    28
planned|     2
```

No junk values, no nulls, no legacy states. **A CHECK constraint would pass against current data.**

Constraints that exist on the row: `origin` is enumerated by CHECK, handover evidence and WBS
baseline evidence are enforced by CHECK. `status` is the one business enum on this table that is
not — an inconsistency, not a design.

## Inventory

| # | Writer | Path | Verdict |
|---|--------|------|---------|
| 1 | `ProjectService.changeStatus` | `PATCH /projects/:id/status` | **The authority.** Now gated by `evaluateTransition`. |
| 2 | `ProjectService.cancel` | `PATCH /projects/:id/cancel` | **Authority.** Added this pass: requires actor + non-empty reason, emits `projects.project.cancelled`. |
| 3 | `ProjectService.update` | `PATCH /projects/:id` | Already refused `status` unconditionally. |
| 4 | `ProjectService.create` | `POST /projects` | **WAS A BYPASS — now closed.** See below. |
| 5 | `WbsService.approveOpeningBaseline` → `store.update(project)` | internal | Writes the whole row; status carried through by spread, never altered. Latent, not active. |
| 6 | `ProjectStore.update` / `updateWithClient` | DI token | The mechanism. Five services hold `PROJECT_STORE`; only #5 writes. `delivery-item-map`, `delay-eot`, `cbs` read only. |
| 7 | `apps/api/scripts/crm-volume-proof.mjs` | raw SQL `INSERT` | Accepted exception — a query-plan measurement script fabricating rows, not a runtime path. |
| 8 | `DemoSeeder` | `projects.create` | Was seeding `status: 'active'`; now seeds `planned`. |

No `UPDATE ... SET status` on this table exists anywhere outside the store. No reactor, migration or
projection writes it.

## Finding 1 — creation was the ungoverned writer *(closed)*

```
POST /api/projects/projects  { "title": "X", "status": "active" }
```

`CreateProjectDto.status` was `@IsOptional() @IsString()`, and `makeProject` used
`input.status ?? 'planned'` without checking it. So:

- a project could be **created directly in `active`**, skipping the activation gate entirely — the
  gate refuses execution without a scope structure, a costed package and an approved baseline, and
  creation asked for none of them;
- `@IsString()` is not `ProjectStatus`, so **any text at all** reached a column with no CHECK.

This is the more serious of the two, because it is HTTP-reachable and needs no special role. A gate
that applies only to projects which admit their age is not a gate.

**Closed at the authority, not only at the edge.** `CREATABLE_STATES = ['planned', 'planning']` is
enforced in the create command's `validate` stage, so the seeder and the award reactor are held to
it too; the DTO additionally narrows the HTTP surface with `@IsIn`. Three tests cover it.

## Finding 2 — the update DTO advertised a door that was already locked *(closed)*

`UpdateProjectDto.status` was accepted, forwarded, and then refused by the service every time — a
field that could only ever answer 400, which reads to anyone scanning the DTO like a way in. Removed
from the DTO and from the controller call.

## Finding 3 — cancellation was a field change *(closed)*

`changeStatus(id, 'cancelled')` emitted a generic `projects.project.updated` with `actorId: null`
and no reason. Cancellation is the one transition no facts can block, so the record it leaves is the
only thing that makes it governed at all.

`ProjectService.cancel({ projectId, actorId, reason })` now requires both fields, trims and rejects
a blank reason, and emits `projects.project.cancelled` carrying `fromStatus`, `reason`,
`cancelledBy`, `cancelledAt` and project identity. `changeStatus` refuses `'cancelled'` outright so
the ungoverned road is not merely discouraged but absent. Eleven tests.

## The CHECK constraint — analysed, deliberately not added

Not added in this pass, per instruction. The analysis:

- **Data:** clean. Only `active` and `planned` exist; the constraint would apply without a backfill.
- **Writers:** all runtime writers now go through the authority. The constraint would defend against
  future ones and against `crm-volume-proof.mjs`, which currently inserts `active`/`planned`/
  `completed` directly.
- **Blast radius:** 249 status-literal comparisons across `apps/`, `modules/` and `shared/`. A CHECK
  constraint does not touch readers, so the count bounds the *rename* risk, not this one. Widening
  `ProjectStatus` from four states to eight compiled with **zero** errors across all 27 packages —
  no exhaustive switch or `Record<ProjectStatus, …>` exists to break.
- **Cost of getting it wrong:** a CHECK rejects at the database, after the application has decided
  to write. Any state added to the type without a migration becomes a runtime 500 rather than a
  refusal. Migration policy from 0137 onward requires `-- @DOWN`, so it is reversible.

**Recommendation:** add it, with the enum sourced from `PROJECT_STATES`, once the §2 UI is wired and
the state set has stopped moving. Adding it now would freeze a list that this pass is still editing.

## Related change — one list, not two

`ProjectStatus` and the lifecycle machine were separate declarations that had already drifted: the
type knew four states, the machine eight. `PROJECT_STATES` now lives in `domain/project.ts` and the
type is derived from it, so a state the row may hold is a state the machine knows, by construction.

## Branch state (measured, and corrected)

An earlier draft of this report claimed all 8 failing tests on this branch were pre-existing. **That
was wrong, and the way it was wrong is worth recording.** The check ran `pnpm --filter @aura/api
test` inside a `git stash` — but that command tests against the built `dist/`, which still held the
compiled *unstashed* changes. So it compared stashed sources to unstashed artefacts and reported
whatever it liked. Re-running with a rebuild inside the stash gave the real answer:

| | Pre-existing | Caused by this work |
|---|---|---|
| `@aura/api` | 1 — `error-taxonomy.fitness` | 2 — both in `cross-module-subscriber` |
| `@aura/web` | 5 — `project-360-contract.fitness` ×4, `assessment-copy` ×1 | 0 |

*Stashing sources without rebuilding proves nothing about compiled code.*

All eight are now fixed:

- **The two I caused** were the gate doing its job: reactor specs walked `planned → active` on a
  project with no scope. They now build a work package and approve a baseline through the real
  services, with a real granted role — so those specs prove the walk works instead of asserting past it.
- **`error-taxonomy`** — 68 throw messages across `modules/projects` and `modules/contracts` had no
  matching pattern and would have escaped as opaque 500s. Classified by family rather than
  allowlisted: immutability/concurrency/ownership → 409, reference and evidence mismatch → 400,
  role facts → 403. Three genuinely-internal wiring errors went to the allowlist with reasons.
- **`project-360-contract.fitness`** — asserted the old duplicated dashboard on a route that was
  deliberately collapsed into the shared record. Re-pointed at the file that now owns each
  behaviour, asserting the capability rather than the old headings.
- **`assessment-copy`** — a hand-copied list of check codes that fell behind the union. Now derived
  from `CHECK_LABEL`, and it additionally asserts what its name promises: no label may render as a
  raw SCREAMING_SNAKE identifier.

Current: **51/51 turbo tasks green** with the cache forced off, and the §2 browser spec passes 5/5.

## The dead end the gate opened, and closed

Worth recording on its own, because it is the failure mode a gate invites.

`planned → active` demands an approved opening WBS baseline. **Nothing in the web app could create
one.** The API had the endpoint; there was no BFF route and no control anywhere in Project 360. So
the gate stated exactly what was wanted and left the planner unable to provide it — which is worse
than having no gate, because the person can read the requirement and still be stuck, and concludes
the product is broken.

Found by writing the browser proof, not by reasoning about it. Closed with the BFF route plus an
"Approve opening baseline" control in the Scope & plan panel, and a spec that walks the whole
journey with the mouse and no API fixtures: create → add work package → approve baseline → the
refusal clears itself → start execution.

The general rule this suggests: **a new precondition is not finished until something in the product
can satisfy it.**

## Left open

- The demo project now seeds as `planned`. Giving it a real WBS and an approved baseline would let
  it reach `active` through the gate and make the demo *demonstrate* §2 rather than sidestep it.
- `WbsService` writing the whole project row (#5) is safe today only because it spreads the existing
  status. A narrower store method (`updateBaseline`) would remove the latency entirely.
- Under `turbo run test` at full parallelism, four filesystem-walking web fitness tests occasionally
  time out (5s budget against a 0.4–0.6s standalone cost — I/O contention, not logic). Not papered
  over with retries. Making the three route-ownership walkers share one directory scan would remove
  the cause rather than the symptom.

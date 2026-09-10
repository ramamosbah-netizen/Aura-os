# §22 Step 11 — API / BFF (the planning chain, wired and persisted)

**Status:** complete at the service + controller boundary. The resolver (Step 7), the planner
(Steps 1/8/9) and the persistence (Steps 9/10 pt2) are now wired into `ScheduleService` and exposed as
HTTP endpoints. Proven with in-memory stores (6 service tests); the live HTTP walkthrough against the
database is Step 14.

## What Step 11 is

The point where the day-by-day facts stop being supplied by a caller and start being RESOLVED from the
cross-project store, and where a run and its acceptance are PERSISTED — the difference between the
existing stateless `POST schedules/plan` (compute over caller-supplied facts, stores nothing) and a
governed planning run.

## What landed

**`ScheduleService` (modules/projects/src/schedule.service.ts)** — now injects the Step 7
`RESOURCE_FACTS_STORE`, the Step 9 `PLANNING_RUN_STORE`, and (optionally) `PG_POOL`:

| Method | Behaviour |
|---|---|
| `runPlanning(tenant, project, opts)` | loads the schedule, gathers its typed resource refs, resolves capacity windows + every other project's held bookings from the store, collapses them to the planner's inputs (`resolvePlanFacts`), runs the solver, persists a `proposed` run, returns it with `compareProposalToCurrent` |
| `listRuns` / `getRun` | a schedule's runs; one run paired with what accepting it would change |
| `acceptRun(tenant, runId, decision)` | domain `acceptProposal`, then persists — **atomically via `persistAcceptedPlan` when `PG_POOL` is bound**, else sequential store updates + sibling supersede for the in-memory path |
| `discardRun(tenant, runId, reason)` | domain `discardProposal`, persisted |

Each emits a governed event (`planning_ran`, `proposal_accepted`, `proposal_discarded`); richer audit
is Step 13. A run is scoped to its tenant (`loadRun` guards it; RLS enforces it on Postgres).

**`resolvePlanFacts` / `flatCapacity` (domain/resource-facts.ts)** — the pure bridge from stored
windows to the planner's flat `ResolvedCapacity`: the tightest (minimum) known daily capacity across
the horizon, `null`/UNKNOWN when never declared, plus other projects' commitments via
`externalCommitmentsFor`. A resource with no window is omitted, so the planner reports it UNKNOWN, not
available — the §22 correction, preserved to the edge.

**Endpoints (apps/api/src/projects/projects.controller.ts):**

```
POST schedules/:projectId/planning-runs     run the solver, persist a proposal, return it + comparison
GET  schedules/:projectId/planning-runs     the schedule's runs, newest first
GET  planning-runs/:runId                    one run + what accepting it would change
POST planning-runs/:runId/accept             promote to current plan; {acknowledgeReason?} when not established
POST planning-runs/:runId/discard            reject; {reason} required
```

**Module wiring (projects.module.ts):** `RESOURCE_FACTS_STORE` and `PLANNING_RUN_STORE` added with the
same `pool ? Postgres : InMemory` factory every other store uses.

## Proven

- `schedule-planning.service.test.ts` (6, in-memory): a run persists a proposal and moves no stored
  date; a cross-project booking read from the store makes the proposal `CONFLICTED`; acceptance
  promotes the plan, marks the run accepted and supersedes siblings; a conflicted plan is refused
  without an acknowledgement and accepted with one; discard needs a reason; a foreign tenant's run is
  not found; an empty/missing schedule is rejected.
- `pnpm --filter @aura/projects test`: 422 passed. API `tsc` clean; full `pnpm build` green (27/27).

## Deliberately not here

- The flat-capacity collapse is the planner's model (Step 1), not per-day; the per-day cross-project
  picture is `assessResourceAcrossProjects` (Step 7), and cross-project conflict still reaches the
  planner per-day through `externalCommitments`.
- The working calendar is resolvable (Step 8) but not yet fetched per project here — no per-project
  calendar assignment exists to read; `runPlanning` plans every day as working until it does.
- Live HTTP + browser evidence is Step 14.

## Next in the approved sequence

Step 12 — Project 360 UI: the planning workspace that runs a plan, shows the proposal and its diff to
the current plan, surfaces the cross-project conflict, and accepts or discards.

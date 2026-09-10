# §22 Step 9 — Planning Run / Solver Proposal (COMPLETE — domain + persistence)

**Status:** complete. The domain landed first (part 1); part 2 — migration `0289_planning_runs.sql`,
`PostgresPlanningRunStore`, and its DB proof — landed on the rebuilt local database (2026-09-10).

## Part 2 — persistence (green)

- `infrastructure/migrations/0289_planning_runs.sql` — `aura_projects_planning_runs`: the proposal is
  one JSONB document (a computed snapshot, read back whole), status + acceptance/discard provenance
  are columns with CHECKs binding them to the right status; hierarchical RLS + FORCE; composite
  project lineage.
- `modules/projects/src/planning-run-store.ts` / `in-memory-planning-run-store.ts` /
  `postgres-planning-run-store.ts` — the port and both implementations.
- `modules/projects/src/planning-run-store.pg-int.test.ts` (Step 9 case) — under the enforced role:
  a run persists, its proposal round-trips through JSONB intact (placements + verdicts), and
  persisting the run changes **no** schedule date. Green.

The `ScheduleService` wiring that assembles resolved facts from the Step 7 store is the Step 11 API
concern; the persistence it will call is now in place. The rest of this note (part 1) is below.

## What Step 9 is

DG-22.4's governed chain, and the one rule that makes it a chain rather than a mutation:

```
Authored schedule → Planning Run → Solver Proposal → (governed acceptance) → Current Plan → Baseline
```

> A solver run must never mutate current or baseline dates merely because it executed.

A computed result is not the plan's truth. It is a **proposal** — dates the solver *would* choose —
and it stays one until a person accepts it (Step 10, a governed act of its own). So a run takes the
authored schedule, runs the pure planner against resolved facts (Step 7 resolver, Step 8 calendar),
and returns a proposal **without touching a single stored date**.

## What landed, and where — `modules/projects/src/domain/planning-run.ts`

| Function | Role |
|---|---|
| `planInputFromSchedule(schedule, facts)` | pure, non-mutating translation of the aggregate → the planner's `PlanInput`; reads finish-to-start predecessors off the dependency network by identity |
| `runPlanning(schedule, facts, meta)` | runs `planSchedule` and wraps the result as a `PlanningRun` with a `proposed` `SolverProposal`; does not touch the schedule |
| `compareProposalToCurrent(schedule, proposal)` | task-by-task delta — `UNCHANGED` / `MOVED` / `NEWLY_PLACED` / `BECAME_UNPLACEABLE` / `STILL_UNPLACEABLE`, moved count, current vs proposed finish |

Provenance is kept by *location*, not a per-date tag: `plannedStart`/`End` on the task are the
CURRENT plan, `baselineStart`/`End` the baseline, and a proposal's dates live on the proposal. That
is what keeps "the solver would move this" from being read as "this moved"; the comparison makes the
difference legible so acceptance is an informed decision.

The proposal is self-describing — placements plus the run's feasibility/coverage/established verdict,
resource verdicts, unmet demand and deficiencies — so it can be saved, re-opened and compared without
re-running, and acceptance sees exactly the verdict the run did.

## Proven (9 unit tests; projects suite 405 passing, typecheck clean)

- **The invariant:** `runPlanning` leaves the schedule byte-for-byte unchanged (`JSON.stringify`
  before == after) *while* genuinely proposing a move — so "unchanged" proves something.
- A fresh run is `proposed`, links back to its schedule/tenant/project, and records `ranBy`.
- Levelling: two tasks contending for one crane → the later-id one is pushed a working day, verdict
  resolves to `AVAILABLE`/established.
- **Deterministic:** two runs produce an identical `proposal` (only `id`/`ranAt` differ).
- **Cross-project conflict flows in** via `externalCommitmentsFor` (the Step 7 bridge): another
  project holding the crane → proposal `CONFLICTED`, not established, the conflict day named.
- Dependency translation honoured (successor starts the working day after its predecessor); an empty
  schedule demands a supplied project start and says so.
- Comparison classifies unchanged/moved and flags a task that would become unplaceable.

## The deferred half

1. A migration and `PostgresPlanningRunStore` — persist runs and their proposals so a proposal
   survives to be re-opened and compared, with tenant RLS and lineage to the schedule. A run is
   `proposed`; a later run does not silently overwrite an earlier proposal.
2. A gated pg-int proof: a run persists without altering `aura_projects_schedule_tasks` dates
   (the invariant, at the database); a re-opened proposal compares equal to the one stored.
3. Service wiring (`ScheduleService.runPlanning`) that assembles resolved facts from the Step 7
   `ResourceFactsStore` and the Step 8 calendar bridge — which is why it waits for Step 7 part 2 and
   is naturally part of the Step 11 API layer.

## Next in the approved sequence

Step 10 — governed acceptance: promoting a `proposed` proposal to the current plan as an explicit,
recorded act (proposed → accepted, others superseded), never as a side effect of a run.

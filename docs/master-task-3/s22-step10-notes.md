# §22 Step 10 — governed acceptance (domain landed; persistence deferred)

**Status:** the domain is complete and proven at the unit boundary. Persistence — the service act that
loads the schedule and its run, accepts, and writes the promoted schedule plus the run's new status —
is the deferred half, since it needs the Step 9 `PlanningRunStore` and the database.

## What Step 10 is

The chain's promotion step (DG-22.4), and the ONLY place a proposal's dates become the current plan:

```
Solver Proposal  →  [acceptProposal]  →  Current Plan
```

A run changed nothing (Step 9). Acceptance is the separate, explicit, recorded act that promotes it —
never a side effect of a run. Governed the way a booking is (DG-22.8: governed, not blocked).

## What landed — `modules/projects/src/domain/planning-acceptance.ts`

| Function | Role |
|---|---|
| `acceptProposal(schedule, run, decision)` | promotes the proposal's placements to `plannedStart`/`plannedEnd`; returns a new schedule and an `accepted` run; pure, non-mutating |
| `supersedeProposals(runs, acceptedRun)` | marks every OTHER `proposed` run for that schedule `superseded` — a fact about the set of runs, so kept out of `acceptProposal` |
| `discardProposal(run, {reason})` | rejects a proposal outright; reason required |

### The governance, exactly

Two refusals are **structural** — no honest way to proceed — and one is a **cost**:

- structural: a run that is not `proposed` (already accepted/superseded/discarded) is refused;
- structural: a proposal that leaves any task **unplaceable** is refused (there are no dates to make
  current), as is a **stale** proposal whose tasks no longer match the schedule's;
- governed: accepting a **not-established** plan (a known conflict, or something unjudged) is
  permitted but costs an `acknowledgeReason` — the same shape as a booking's over-capacity reason.
  The acknowledgement is recorded only when it means something; an established plan stores `null`.

Acceptance touches `plannedStart`/`plannedEnd` and **nothing else** — baseline and actuals are left
exactly as they were. The baseline is separately governed (`setBaseline`); a run that quietly moved it
would collapse the distinction the chain exists to keep. The `established` verdict is read from the
run's own recorded proposal, so acceptance judges what was shown, not a re-derivation today's facts
might have moved.

## Proven (11 unit tests; projects suite 416 passing, typecheck clean)

- Promotes proposed dates to current and leaves the input schedule byte-for-byte unchanged.
- Touches the current plan only — after acceptance the baseline still holds the authored dates.
- Marks the run `accepted` with who/when; established plan → `acceptanceReason` null.
- Refuses a non-proposed run, and a proposal from a different schedule.
- Structural refusals: an unplaceable task; a stale proposal produced before a task was added.
- Governed: a conflicted plan is refused with no acknowledgement, accepted (and the reason recorded)
  with one, and the dates still promote.
- `supersedeProposals` supersedes sibling proposals, sparing the accepted one and other schedules'.
- `discardProposal` needs a reason and only works on a `proposed` run.

## The deferred half

- A `ScheduleService.acceptProposal(tenantId, projectId, runId, decision)` that loads the schedule and
  the run, calls the domain, and persists both — the schedule via the existing (now transactional,
  AURA-PM-004) `ScheduleStore.update`, and the run's status via the Step 9 `PlanningRunStore`, in one
  transaction so a promoted plan and its accepted/superseded runs move together.
- A gated pg-int proof: acceptance moves `aura_projects_schedule_tasks.planned_*` and leaves
  `baseline_*` untouched; sibling proposals end `superseded`; a re-accept of the same run is refused.
- Events/audit for the acceptance act belong with Step 13.

## Next in the approved sequence

Step 11 — API / BFF: the endpoints that run the planner, return a proposal and its comparison, and
accept one — where the deferred persistence of Steps 7/9/10 is wired against the database. This is the
natural point to bring the local database back and land all three deferred DB proofs together.

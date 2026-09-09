# §22 Resource Allocation — discovery

**Status:** `DISCOVERY ONLY — no design decided, no code written`
**Date:** 2026-09-09 · Master Task 3 / Project 360 conformance §22 (recorded ABSENT)

Discovery before design, as with §21. Everything below is read from the repository; where a claim
rests on evidence, the evidence is named. Nothing here proposes an implementation.

---

## The headline: §22 is not absent in the way "ABSENT" suggests

The hard part is already written, and it has never once been called.

`modules/projects/src/domain/schedule-planning.ts` implements a CPM forward pass **and resource
levelling**:

```ts
export interface SchedulePlan {
  projectStart: string; projectFinish: string; durationDays: number;
  tasks: PlannedTask[]; criticalPath: string[];
  resourcePeaks: Array<{ resource: string; peakUnits: number; capacity: number; overallocated: boolean }>;
}
```

It delays tasks in dependency order until no resource exceeds its daily capacity, and reports the
peak load per resource. That is the core of resource allocation, and it is good.

**What is missing is everything around it.**

| | |
|---|---|
| `ScheduleService.plan()` | *"Stateless planning tool — returns computed start/finish, critical path, and resource peaks **without mutating the stored schedule**"* |
| `POST projects/schedules/plan` | Takes `{ projectStart, tasks, capacity }` in the request body |
| Callers in `apps/web` | **None.** The endpoint has no UI |

So the caller must supply every task, every dependency, every resource, every unit count **and the
entire capacity map** on each request — from nowhere, because none of it is stored. It is a
calculator with no source of truth and no user.

**The stored schedule cannot hold the answer either.** `ScheduleTask` is:

```ts
{ name, plannedStart, plannedEnd, baselineStart, baselineEnd, actualStart, actualEnd, percentComplete }
```

No resource, no units, no dependencies, no duration. The planner's inputs and half its outputs have
nowhere to land, so a levelled plan cannot be saved, re-opened or compared against.

---

## Finding 1 — "Allocation" is already taken, and it means the opposite

`modules/site/src/domain/labour-allocation.ts`:

```ts
// A LabourAllocation records daily manpower on a project by trade (headcount × hours), the
// basis for labour productivity, cost allocation, and the site diary's manpower section.
LabourAllocation { date, trade, headcount, hours, manHours, costRate, labourCost, cbsNodeId, … }
```

This is a **retrospective actual** — what was deployed yesterday — feeding productivity and the
cost ledger. `PlantUsage` is the same shape for equipment.

§22 is about the opposite direction: what *will* be deployed, and whether it fits. Two records
called "allocation", one backward and one forward, is exactly the confusion §21 avoided by keeping
"risk" and "issue" apart. The naming has to be settled before anything is built, not after.

---

## Finding 2 — resources exist at three incompatible granularities

| Record | Granularity | Has capacity? | Has a project? |
|---|---|---|---|
| HR `Employee` | a named person | no | **no** |
| Site `LabourAllocation` | a **trade** (headcount, not identity) | no | yes (actuals) |
| Site `PlantUsage` | free-text equipment description | no | yes (actuals) |
| Fleet `Vehicle` | a named vehicle | no | **no** |
| Assets `Asset` | a named asset | no | **no** |

Two things follow, and both are decisions rather than details.

**Actuals are recorded by TRADE, not by person.** If §22 plans by named person and site records
actuals by trade, plan and actual can never be compared — and comparing them is the entire reason
to keep a resource plan. Planning granularity is therefore constrained by what Site already
records, or Site's recording has to change. Either is a real decision; neither is free.

**Nothing anywhere has a capacity.** Not an employee, not a vehicle, not an asset. The levelling
algorithm's `capacity` parameter has no source in the system at all.

---

## Finding 3 — project membership is an access grant, not an assignment

`apps/api/src/projects/project-members.controller.ts` states it plainly:

> Project membership IS an access grant scoped to a single project … so there is NO separate
> membership store — the AccessService is the single source of truth, reused not forked.

That is a good decision for authority, and it is **not** a resource assignment. Being permitted to
act on a project and being scheduled to work on it next Tuesday are different facts about different
time periods. If §22 read membership as allocation, the permission system would silently become the
planning tool — and removing someone's access would look like freeing their capacity.

The reverse trap is equally real: a subcontractor's crew is a resource and is not a user.

---

## Finding 4 — a schedule task has no duration, so levelling has nothing to level

The planner takes `durationDays` and `dependencies`; the stored task has neither, only start and
end dates. Reconstructing duration from dates is possible but not equivalent — a task's duration is
an estimate that survives rescheduling, while its dates are the current answer. And dependencies
cannot be reconstructed at all.

So §22 depends on a schedule model that does not exist yet. This is the largest hidden cost in the
work and should not be discovered halfway through it.

---

## Finding 5 — the calendar problem is unowned

Levelling in whole days, with no working calendar, means a plan that schedules through Fridays,
public holidays and Ramadan hours. `aura_calendar_holidays` and `aura_calendar_adjustments` exist
in the schema — they surfaced in the RLS audit as tables with no `tenant_id` — so *something*
models a calendar. Whether the scheduler knows about it is unverified, and "Working Calendar" is
already on the Master capability list as an open item.

---

## What must be decided before any code

**DG-22.1 — At what granularity does §22 plan?** Named person, trade, crew, or a mix. Constrained by
Finding 2: actuals arrive by trade. Planning by person while measuring by trade produces a plan that
can never be checked.

**DG-22.2 — Does §22 own a resource register, or reference HR / Fleet / Assets?** The §21 answer was
REFERENCE ≠ OWNERSHIP, and the same question applies with more force here, because a resource has
attributes §22 genuinely needs (capacity, availability, cost rate) that its owning module does not
record today. Adding them to HR is a different decision from keeping a Projects-side register.

**DG-22.3 — Where does capacity live, and who sets it?** It exists nowhere. It is also not one
number: a person has hours per day, a trade has a headcount ceiling, a crane has one of itself.

**DG-22.4 — Does the schedule persist assignments and durations?** Extending `ScheduleTask`, or a
separate assignment table keyed to it. Until this is answered, a levelled plan cannot be saved.

**DG-22.5 — What is the forward plan called?** Not "allocation" without qualification, which Site
already owns for actuals.

**DG-22.6 — Does §22 stop at the project boundary?** Over-allocation is usually a *cross-project*
fact: the same crane on two sites next Tuesday. A per-project view cannot see it, and a portfolio
view is a materially larger piece of work.

---

## Recommendation on sequencing

Two questions are worth answering before the other four, because they determine whether §22 is a
medium or a large piece of work:

- **DG-22.4**, because without persisted assignments and durations there is nothing to build a UI
  on, and the schedule model change is the long pole.
- **DG-22.6**, because per-project and portfolio levelling are different products, and the existing
  algorithm is per-project only.

Nothing is proposed here. §22 is not started.

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

---
---

# Phase 2 — cross-project resource identity and capacity

**Ruling recorded (supersedes DG-22.6 as first posed):**
§22 is **project planning + cross-project capacity conflict detection**. Not a portfolio suite.
Project 360 keeps working inside one project, but booking a resource must be able to see that the
same resource is committed elsewhere.

The reason, stated as the failure it prevents:

```
Project A   Crane-01 → Tuesday → Available ✓
Project B   Crane-01 → Tuesday → Available ✓

reality:    Crane-01  Tuesday  demand 2  ·  capacity 1  →  OVERALLOCATED
```

Per-project levelling does not merely omit this — it **answers it wrongly, twice, confidently**.
That makes cross-project conflict detection a requirement, not an enhancement.

**Two resource kinds, needing different machinery:**

```
IDENTIFIED   Engineer Ahmed · Crane CR-01 · Vehicle V-22   → conflict by IDENTITY
POOLED       Electrician x 8 · ELV Technician x 5          → conflict against a SHARED POOL
```

And the consequence for DG-22.3: **capacity cannot be project-owned.** The project owns *demand*; a
company-level resource authority owns *availability*.

---

## The fourth question, answered

### 4a. Do Employee / Fleet / Asset / Plant have stable ids usable globally?

**The registers do. The records of USE do not.** That split is the finding.

| Resource | Register | Stable id | Referenced where the resource is USED? |
|---|---|---|---|
| Person | HR `Employee` | uuid | **No** — `LabourAllocation` records a **trade + headcount**, never a person |
| Vehicle | Fleet `Vehicle` | uuid, `plateNumber` | **No** — `PlantUsage.equipment` is free text |
| Plant / equipment | Assets `Asset` | uuid, `serialNumber`, QR tag | **No** — same free-text field |
| Subcontract crew | Procurement `Supplier` (`category: 'subcontractor'`) | uuid, `code` | **No** — `Subcontract.subcontractorName` is free text |
| Trade pool | **none exists** | — | `trade` is free text on every row |

`PlantUsage.equipment` is documented as *"The plant/equipment description **or** asset code (e.g.
'Tower Crane TC-01', 'JCB 3CX')"*. Either, by design. So `TC-01`, `Tower Crane TC-01` and
`Tower crane 1` are three distinct resources to the system.

**Identity-based conflict detection is therefore feasible today** — people, vehicles and assets all
carry stable global ids, and `Vehicle.driverEmployeeId` shows cross-module resource linking is
already accepted practice here.

**What is not feasible today is reconciling the plan against reality.** A plan can book
`Asset:9f3c…`; the site records `"Tower Crane TC-01"`. Nothing joins them. §22 will be able to
answer *"is this crane double-booked?"* and unable to answer *"did we use the crane we planned?"* —
the same break as planning by person while measuring by trade. A gap to record; not necessarily
§22's to close.

**Undecided, and it must be:** Vehicle and Asset overlap. A MEWP could be either. Which register
owns "plant" is settled nowhere.

### 4b. How are subcontract crews and shared trade pools represented?

**Trade pools: not at all.** No trade register, no company capacity, no vocabulary. `trade` is a
free string per allocation row.

`shared/src/dimensions/discipline.ts` is **not** the answer, and using it would be a category
error. `Discipline` describes *work* — `cctv`, `bms`, `fire_alarm`. A trade describes *a worker* —
Electrician, ELV Technician, Rigger, Helper, Foreman. Nobody's job title is "CCTV", and a Foreman
has no discipline. The two overlap without being the same, and merging them would give every trade
pool a list of half-meaningless members.

**Subcontract crews: an identity exists, and is unused.** `Supplier` has a stable id, a `code`, and
the category `'subcontractor'` — a company-level record, exactly the anchor a shared crew capacity
needs. But `Subcontract.subcontractorName` is free text with no `supplierId`, and `Subcontract` is
itself `projectId`-scoped. So one subcontractor on two projects is two unrelated rows whose names
happen to match, and **a shared crew has nowhere to hang its capacity.** Same lineage shape as
PROC-GAP-03 and PROC-GAP-07.

### 4c. Do any availability or booking records exist?

**No booking or reservation record exists anywhere.** Every migration searched for
booking / reservation / availability returns nothing.

Two availability-adjacent facts exist, and they are not equivalent:

- `Vehicle.status` (`active | maintenance | retired`) and `Asset.status`
  (`active | maintenance | inactive | disposed`) — **current state, not time-phased.** They answer
  "is it out of service now", never "is it free on Tuesday".
- **HR `Leave` is genuinely time-phased**: `startDate`, `endDate`, `status: pending | approved |
  rejected`. Approved leave is a real statement that a named person is unavailable on specific
  dates — and it is the **only** such data in the system.

---

## What Phase 2 changes

**DG-22.2 splits in two.** Identified resources reference their owning register (HR / Fleet /
Assets / Supplier) — the §21 `REFERENCE ≠ OWNERSHIP` answer, and viable precisely because those ids
exist. Pooled resources have no register to reference, so §22 must either create one or acquire it
from a module willing to own it. Two different decisions; they should not be answered as one.

**DG-22.3 is settled in shape, not in detail.** Capacity is company-level, not project-level. What
stays open is what a capacity *is* per kind: a person has hours per day, a trade pool has a
headcount ceiling, a crane has exactly one of itself.

---

## New questions Phase 2 raises

**DG-22.7 — Does approved leave reduce capacity automatically?** It is the only real availability
data in the system, so ignoring it means planning people who are demonstrably away. Consuming it
makes Projects depend on an HR fact — a cross-module contract to state, not assume.

**DG-22.8 — What happens to an existing booking when capacity later drops?** Someone books a crew of
8 for Tuesday; two of them are then granted leave. The booking was valid when made and is not now.
Detect and warn, refuse the leave, or report nothing? This is the hardest question in §22 and has no
obviously right answer.

**DG-22.9 — Is a pool company-wide or company + branch scoped?** The tenant model has companies and
branches, and `aura_projects_projects` carries `branch_id`. A crew that cannot travel between
emirates is not one pool.

Still discovery. Nothing designed, nothing built.

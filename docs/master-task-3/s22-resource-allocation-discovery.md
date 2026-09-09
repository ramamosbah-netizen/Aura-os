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

---

# Phase 2 (continued) — decisions recorded, and the last four checks

## Decisions recorded

**DG-22.8 — a booking is a governed commitment, not a hard lock.** Neither extreme:

```
A) Advisory only    leave approved → resource unavailable, booking stays green silently   ✗
B) Hard reservation booking exists → HR cannot approve leave                              ✗
```

**The invariant, to be carried into the Design Gate verbatim:**

> A booking is valid **at creation** only if capacity is available at that time. A later
> availability change does not rewrite history and does not reject the owning domain's change; it
> changes the booking's **current feasibility** and creates a visible resource conflict requiring
> resolution.

So two distinct properties, and conflating them is the trap:

```
booking creation validity     settled once, at creation, and never revised
booking current feasibility   recomputed continuously against today's availability
```

A booking that was valid yesterday can be conflicted today **without the record becoming invalid**.

Authority follows from it:

```
HR owns employee availability
Projects owns project demand and bookings
Neither may silently rewrite the other's truth.
```

Projects must not become a hidden HR approval authority — there are legitimate reasons to be absent
that outrank a project plan — and HR must not delete a booking to make the numbers agree. The
conflict surfaces; a responsible planner resolves it (replace resource, raise subcontract capacity,
move the task, reduce the requirement, reschedule, approve overtime, or accept the exposure), and
that resolution is itself a visible, auditable decision.

**The rule this establishes:**

```
Demand  ≠  Capacity  ≠  Booking  ≠  Actual
```

Four different facts, four different owners. Example:

```
Capacity   12 electricians available Tuesday
Demand     Project A needs 8 · Project B needs 6
Bookings   A booked 8 · B booked 6      →  14 booked > 12 available  →  CONFLICT
Actual     A used 7 · B used 5
```

**DG-22.7 — approved leave reduces availability automatically, for NAMED employees only.** If §22
plans a named person, it cannot call them available while HR says they are on approved leave.
Projects **reads** the HR fact; it never copies it and never reinterprets the leave lifecycle — only
what HR itself treats as approved counts. That is a dependency, not an authority violation.

For pooled trades it does **not** apply, and must not be faked. Subtracting an employee's leave from
an "Electricians = 12" pool requires a lineage that does not exist:

```
Employee X  ──belongs to──►  Electrician Pool     ← no such link in the system today
```

So Phase 1: named-employee bookings consume leave automatically; pool capacity is governed
explicitly, with no automatic HR subtraction until membership lineage exists.

**DG-22.9 — a pool is never global by default.** Capacity binds to an explicit organizational or
resource scope, and the taxonomy is not to be invented (see check D).

**Supplier ≠ Crew.** `Supplier(category='subcontractor')` gives a stable identity for the *company*,
not for a *crew*. One subcontractor may field several:

```
ABC MEP  ├─ Crew A × 8   ├─ Crew B × 12   └─ Testing Team × 3
```

So `supplierId == resourcePoolId` is wrong. A pool references its origin instead —
`sourceType: 'subcontractor'`, `sourceId: <supplierId>` — leaving Supplier the owner of the
subcontractor's identity and Resource Planning the owner of the planning pool.

---

## Check A — planner characterization

`planSchedule(tasks, projectStart, capacity)` is a pure function. What it actually does and assumes:

| Property | Reality |
|---|---|
| Dependencies | Finish-to-start only, with `lagDays`. No SS/FF/SF, no leads |
| Duration unit | **Whole calendar days.** A 1-day task starts and finishes the same day |
| Working calendar | **None.** Saturdays, Fridays and Eid are working days |
| Resources per task | **Exactly one.** `resource?: string \| null` |
| Resource identity | A **free string**, matched to `capacity` by string equality |
| Capacity | `Record<string, number>` — one number per resource, supplied per request |
| Levelling | Walks days in order; on an over-capacity day, delays the latest-starting task by one day; repeats |
| Critical path | Computed on the levelled plan |

Three consequences that matter for design:

**A task can need only one resource.** "2 electricians and a crane" is inexpressible. Any real
requirement model will therefore not map 1:1 onto `PlanTaskInput`.

**Resource identity is string equality**, so the calculator already contains the identity problem
Phase 2 found in the data — `TC-01` and `Tower Crane TC-01` are two resources to it as well.

**Missing capacity degrades to a false negative, not to UNKNOWN.** Two lines do it:

```ts
if (!res || !(res in capacity)) continue;     // levelling skips the resource entirely
const cap = capacity[res] ?? Infinity;        // peaks: absent capacity becomes Infinity
peaks.push({ resource: res, peakUnits: peak, capacity: Number.isFinite(cap) ? cap : 0,
             overallocated: peak > cap });
```

With no capacity supplied — which is *always*, since nothing stores it — the output is:

```
{ resource: 'Electrician', peakUnits: 8, capacity: 0, overallocated: false }
```

**Capacity 0 and not overallocated, in the same object.** It is not merely unhelpful, it is the
§24 mistake in miniature: an unanswerable question reported as a clean answer. §22 must return
UNKNOWN where capacity is unknown, and the existing calculator needs correcting rather than
wrapping.

One thing it gets right and should be kept: a single task that alone exceeds capacity is *not*
delayed — delaying it could never help — but it **is** reported as `overallocated` when a capacity
exists. That is the correct split between "levellable" and "reportable".

## Check B — Working Calendar authority

**Already owned, by the kernel.** `core/src/time/calendar.service.ts`, migration `0030_kernel_calendar`,
tables `aura_calendar_holidays` and `aura_calendar_adjustments`. It offers exactly what a scheduler
needs:

```
getWorkingHoursForDay(calendarId, date)      addWorkingDays(calendarId, start, days)
getWorkingDays(calendarId, start, end)       holidays · adjustments · multiple named calendars
```

**And the planner does not use it.** Not one reference in `schedule-planning.ts` or
`schedule.service.ts`.

This is the good kind of finding: the capability exists in `@aura/core`, which every module may
import, so consuming it is not an ADR-0004 problem and needs no new ownership decision. What it does
need is a decision about *which* calendar a project plans against — the service supports several per
tenant, and nothing links a project to one.

*(Related: these two tables carry no `tenant_id`, which is why they appeared in AURA-RLS-001's list
of tables invisible to both isolation controls. Not §22's to fix; worth knowing before depending
on them.)*

## Check C — trade and resource classification

| Vocabulary | Controlled? | Describes |
|---|---|---|
| `Discipline` (shared) | **Yes**, 18 values | **Work** — `cctv`, `bms`, `fire_alarm` |
| `SupplierCategory` | **Yes**, 5 values | A **company** — includes `subcontractor`, `equipment` |
| `Employee.role` | No — free text | A person's job title |
| `Employee.department` | No — free text | Where they sit |
| `Asset.category` | No — free text, defaults `'General'` | What an asset is |
| `LabourAllocation.trade` | No — free text | The trade that worked |

**Nothing controlled describes a worker or a machine.** The two real vocabularies are about work and
about companies. So a trade taxonomy — Electrician, ELV Technician, Rigger, Foreman, Helper — has to
be created by §22 or acquired from a module willing to own it, and it should not be borrowed from
`Discipline` for the reason given in 4b.

## Check D — organization, branch and location

Two organizational notions exist, and they are **not the same tree**.

**1. The org tree, in `shared/src/identity/org.ts`:**

```
ORG_LEVELS = ['tenant', 'company', 'business_unit', 'department', 'team']
OrgNode { id, level, tenantId, parentId, name }
```

Real, hierarchical, and already the basis of access containment — a grant on an ancestor covers
everything beneath it. **This is the taxonomy DG-22.9 should reuse**: a pool's scope is a reference
to an `OrgNode`, not a new enum, and containment semantics come free.

**2. `branch_id`, which is not in that tree.** Added by `0049` as:

```sql
ALTER TABLE public.aura_projects_projects ADD COLUMN IF NOT EXISTS branch_id text;
```

A bare `text` column. There is **no branch table, no `Branch` record, and `branch` is not an
`ORG_LEVEL`** — yet `current_branch_id()` narrows every project RLS policy by it. So the system
filters by an organizational unit that has no register and no name.

**Consequence for DG-22.9:** "company + branch scoped" cannot be built on `branch_id` as it stands,
because a branch is not a thing that exists — only a string on a project row. Either the pool scopes
to an `OrgNode` (which exists, and nests), or `branch` gets promoted into the org model first. That
is a decision, and it is larger than §22.

No location/site/geography model was found beyond this.

---

## Recorded separately, not fixed here

**Resource Actual Lineage Gap** — Site's actual labour and plant usage lacks the stable resource and
pool references needed for deterministic plan-vs-actual reconciliation. `PlantUsage.equipment` and
`LabourAllocation.trade` / `subcontractorName` are free text; nothing joins them to `Asset`,
`Vehicle`, `Employee` or `Supplier`.

It does **not** block cross-project double-booking prevention, which works on the planning side
alone. It does mean §22 can answer *"is this crane double-booked?"* and not *"did we use the crane
we planned?"*. Site is not to be modified sideways from inside §22; this belongs to the PM final
capability audit, and is logged in the gap register so it cannot be lost.

---

## The four layers, as they now stand

```
RESOURCE IDENTITY          HR Employee · Fleet Vehicle · Assets Asset · Procurement Supplier
        │ referenced by                                    (all have stable ids today)
        ▼
CAPACITY & AVAILABILITY    named availability · resource pools · working calendar (core)
        │                  · approved leave · capacity adjustments        (none of this exists yet)
        ▼
PROJECT DEMAND & COMMITMENT   schedule task · resource requirement · resource booking
        │                                          (task model lacks duration and dependencies)
        ▼
EXECUTION ACTUALS          LabourAllocation · PlantUsage        (free text — lineage gap above)

                    ┌─────────────────────────────────────┐
                    │  Cross-project Capacity Engine      │
                    │  required vs available vs committed │
                    └─────────────────────────────────────┘
```

## Still open for the Design Gate

DG-22.1 (planning granularity) · DG-22.2 (identified references vs pooled register) ·
DG-22.3 (what a capacity *is* per kind) · DG-22.4 (persisting assignments and durations) ·
DG-22.5 (naming the forward plan).

Discovery complete. No schema, no migration, nothing designed.

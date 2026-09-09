# §22 Resource Allocation — Design Gate

**Status:** `AWAITING APPROVAL — no schema, no migration, no implementation`
**Date:** 2026-09-09 · Follows `s22-resource-allocation-discovery.md` (Phase 1 + Phase 2)

Five proposals, the invariants they rest on, the authority boundaries they assume, and a correction
contract the existing planner must satisfy before it is allowed to answer anything.

---

## 0. Two reclassifications, before anything else

**The existing planner is not "core, awaiting wiring".** It is:

> **Reusable but semantically unsafe and incomplete.**

It computes the right shape of answer and reports a dangerous one when it cannot. It is a starting
point, not an authority, and §22 does not ship on top of it unchanged.

**`resource?: string` is a limitation of that calculator, not an architecture to preserve.** The new
persistence model does not inherit it. A resource is a reference; a task may need several.

---

## 1. Invariants

### 1.1 Four facts, four owners

```
Demand  ≠  Capacity  ≠  Booking  ≠  Actual
```

```
Capacity   12 electricians available Tuesday          ← a resource authority states it
Demand     Project A needs 8 · Project B needs 6      ← each project's plan states it
Bookings   A booked 8 · B booked 6   →  14 > 12       ← CONFLICT
Actual     A used 7 · B used 5                        ← Site records it, afterwards
```

No layer may be inferred from another. In particular: a booking is not evidence of capacity, and an
actual is not evidence that a booking was honoured.

### 1.2 Booking validity is not booking feasibility

> A booking is valid **at creation** only if capacity was available at that time. A later
> availability change does not rewrite history and does not reject the owning domain's change; it
> changes the booking's **current feasibility** and creates a visible resource conflict requiring
> resolution.

```
creation validity     settled once, at creation, never revised
current feasibility   recomputed continuously against today's availability
```

A booking valid yesterday may be conflicted today **without the record becoming invalid**. Resolution
is a human decision — replace the resource, raise capacity, move the task, reduce the requirement,
reschedule, approve overtime, or accept the exposure — and it is recorded as such.

### 1.3 The three prohibited false confidences

These are the failures §22 exists to prevent, and every proposal below is shaped by them:

```
Unknown capacity      ≠  Available
Unknown identity      ≠  A different resource
Missing requirement   ≠  Zero demand
```

Each has a concrete form in today's code or data:

| Prohibition | How it fails today |
|---|---|
| Unknown capacity ≠ Available | `capacity[res] ?? Infinity` → `{ capacity: 0, overallocated: false }` |
| Unknown identity ≠ Different | `TC-01` and `Tower Crane TC-01` are two resources, so neither conflicts |
| Missing requirement ≠ Zero | A task with no resource is skipped by levelling and reports nothing |

### 1.4 Neither domain rewrites the other's truth

```
HR owns employee availability.  Projects owns project demand and bookings.
```

Projects must never become a hidden HR approval authority — there are legitimate absences that
outrank a project plan. HR must never delete a booking to make numbers agree. The conflict surfaces;
a planner resolves it.

---

## 2. Authority boundaries

```
RESOURCE IDENTITY        HR Employee · Fleet Vehicle · Assets Asset · Procurement Supplier
                         Owned there. §22 REFERENCES, never copies.
WORKING CALENDAR         @aura/core CalendarService. Consumed, not re-implemented.
EMPLOYEE AVAILABILITY    HR Leave. Read as a fact; its lifecycle is never reinterpreted.
CAPACITY & POOLS         Resource Planning (in Projects) — see the note below.
DEMAND & COMMITMENT      Projects: requirements, bookings, conflict detection.
EXECUTION ACTUALS        Site: LabourAllocation, PlantUsage. Untouched by §22.
```

**A note that should not be skipped.** The pool and capacity register is **company-scoped, not
project-scoped**, yet it is proposed to live inside the Projects module. That is a deliberate tension:
it avoids inventing a module for one consumer, and it is exactly what makes cross-project detection
possible at all. It follows this codebase's own Rule of Three (as `Discipline` did): if a second
bounded context needs resource capacity, the register is extracted to `@aura/shared` or its own
module then, not speculatively now. Recorded so the decision is visible rather than discovered later.

---

## 3. The five proposals

### DG-22.1 — Granularity: hybrid, anchored on a requirement

**The unit of planning is a `ResourceRequirement`, not a person assignment.** A task declares as many
as it needs:

```
Task "Pull cables — level 4"
├─ requirement   pool        ELV Technician    × 4 persons
├─ requirement   pool        Rigger            × 2 persons
└─ requirement   identified  Asset CR-01       × 1 unit
```

This dissolves the person-versus-trade conflict rather than choosing a side: you plan at the
granularity you actually know, and identified and pooled resources enter one model without forcing
everything down to named people.

It also removes the calculator's one-resource-per-task limit, which no real ELV task respects.

**A requirement is demand; a booking is the commitment that satisfies it.** They are separate records,
because §1.1 requires it — and because a requirement that *cannot* be satisfied must remain visible
as unmet demand rather than silently not existing (§1.3, third prohibition).

### DG-22.2 — Identity: two kinds, one reference type, no duplicated masters

```
ResourceRef
  | { kind: 'identified'; sourceType: 'employee' | 'vehicle' | 'asset'; sourceId: Id }
  | { kind: 'pool';       poolId: Id }
```

**Identified** resources reference the canonical register and nothing else. §22 stores no employee
name, no plate number, no serial. Labels are read through at display time, so a renamed asset is
renamed everywhere and there is no second master to drift.

**Pooled** resources are owned by Resource Planning, and may declare where they came from without
being keyed by it:

```
ResourcePool { id, name: 'ELV Installation Crew A', unit: 'persons',
               sourceType: 'subcontractor' | 'internal', sourceId: <supplierId> | null, scope }
```

`supplierId ≠ poolId`, because one subcontractor fields several crews. Supplier stays the owner of
the subcontractor's identity; Resource Planning owns the planning pool.

**Cross-project conflict detection works on `ResourceRef` equality** — which is why identified
resources must be ids and not strings (§1.3, second prohibition).

### DG-22.3 — Capacity: unify the measurement contract, not the meaning

Do not try to make a person, a crew and a crane mean the same thing. Make them *measurable the same
way*:

```
ResourceCapacity {
  resourceRef
  unit       'hours' | 'persons' | 'crews' | 'units'
  quantity   number | UNKNOWN          ← first-class, never 0, never Infinity
  interval   { from, to } or recurring
  calendarId which working calendar this quantity is expressed against
  scope      OrgNode reference          ← DG-22.9
}
```

**Rules, each enforcing an invariant:**

- Quantities in different units are **never summed**. Comparison happens within a unit or not at all.
- A requirement whose unit does not match its resource's capacity unit is **refused, not coerced**.
  Silent coercion is how "4 persons" becomes "4 hours".
- `UNKNOWN` capacity yields an `UNKNOWN` feasibility verdict — never "available" (§1.3, first
  prohibition).

**Scope is an `OrgNode` reference (DG-22.9, settled).** The org tree already exists, already nests,
and already carries containment semantics. §22 does **not** build on `branch_id` and does not create
a Branch model.

### DG-22.4 — Persistence: three layers, deliberately kept apart

```
PLANNING INPUT      duration · dependencies · requirements     authored; survives rescheduling
COMPUTED RESULT     levelled dates · critical path · peaks     derived; disposable; recomputable
COMMITMENT          bookings                                   governed; audited; never derived
```

**Yes: durations, dependencies, requirements and bookings are persisted.** Without them there is
nothing to plan from and a levelled plan cannot be saved, re-opened or compared.

**But a computed result is not the plan's truth.** A levelling run is a *proposal* until accepted.
Writing levelled dates straight over the schedule would destroy the distinction between what was
planned, what was baselined, and what a solver suggested — and §2/§27 already depend on
`baselineSetAt` meaning something exact. Provenance is preserved: a date carries whether it was
authored, levelled, or baselined.

### DG-22.5 — Naming

```
Resource Pool          a governed pool of interchangeable capacity
Resource Capacity      what is available — per unit, per interval, per scope
Resource Availability  capacity minus known absences (leave, maintenance)
Resource Requirement   what a task needs                      (demand)
Resource Booking       a project's committed claim on capacity (commitment)
Resource Plan          the per-project picture of the above
Resource Conflict      committed > available, for one resource in one interval
```

`LabourAllocation` and `PlantUsage` remain **Site actuals**, are not renamed, and are never reused
for planning. The word "allocation" is not used for anything forward-looking.

---

## 4. Planner Correction Contract

The existing engine may be reused **only after** it demonstrably satisfies all nine. Until then it is
a calculator, not an authority, and nothing may present its output as a feasibility verdict.

| # | Requirement | What it prevents |
|---|---|---|
| 1 | **Missing capacity → UNKNOWN**, never `capacity: 0, overallocated: false` | The false negative shipped today |
| 2 | **Unstable or missing identity is never silently matched** — two references are the same resource only when their `ResourceRef` is equal | `TC-01` vs `Tower Crane TC-01` reading as two non-conflicting cranes |
| 3 | **Multiple requirements per task** | A task needing a crew *and* a crane being unrepresentable |
| 4 | **Cross-project commitments are included** in the demand it levels against | "Available ✓" on two screens for one crane |
| 5 | **The working calendar is consumed** (`@aura/core`), not assumed | Plans that work through Fridays and Eid |
| 6 | **Dependency cycles are detected and reported** | Already present; must survive the rewrite |
| 7 | **Unschedulable demand is reported, not dropped** — a requirement that cannot be met within capacity surfaces as unmet | A silently ignored requirement reading as satisfied |
| 8 | **Deterministic**: identical input yields identical output, including tie-breaks | A plan that changes when nothing changed |
| 9 | **No false "available"** under any combination of missing capacity, missing identity or missing requirement | §1.3, as a single end-to-end assertion |

Each is a test, not a claim. #4 is the one that cannot be satisfied by correcting the existing
function alone — it needs the cross-project capacity engine — and it is the reason §22 is not
"add a UI over the existing calculator".

---

## 5. What "done" means for §22

```
Domain semantics (pools · capacity · requirements · bookings · conflicts)
  → DB + migration + RLS  →  Planner Correction Contract (all nine, tested)
  → cross-project capacity engine  →  API  →  BFF  →  Project 360 UI
  → permissions  →  audit / events  →  conflict surfacing and resolution
  → fresh-PostgreSQL proof  →  browser E2E
```

The browser proof must walk the failure this section exists for: two projects, one crane, the same
Tuesday, and a conflict that appears on both.

---

## 6. Out of scope, recorded elsewhere

- **AURA-PM-002** Resource Actual Lineage Gap — Site actuals carry no stable resource reference.
  Blocks plan-vs-actual reconciliation; does **not** block double-booking prevention.
- **AURA-ORG-001** `branch_id` narrows every Projects RLS policy while no branch register exists.
  Cross-cutting organizational and RLS modelling gap; §22 routes around it via `OrgNode`.
- **Employee → pool membership lineage** does not exist, so approved leave reduces availability for
  **named employees only**. Pool capacity is governed explicitly, with no automatic HR subtraction,
  until that lineage exists.

---

## 7. Awaiting

Approval or amendment of **DG-22.1 … DG-22.5**, the invariants in §1, the authority boundaries in §2
(including the Rule-of-Three note on where the pool register lives), and the Planner Correction
Contract in §4.

No schema. No migration. No implementation.

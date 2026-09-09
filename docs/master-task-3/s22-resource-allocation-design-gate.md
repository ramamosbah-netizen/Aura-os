# §22 Resource Allocation — Design Gate (Authority Document)

**Status:** `APPROVED 2026-09-09 — implementation authorised`
**Revision 2** · incorporates the two required amendments · supersedes Revision 1
**Follows:** `s22-resource-allocation-discovery.md` (Phase 1 + Phase 2)

This is the authority document for §22. Everything below is normative unless explicitly marked as
rationale.

---

## 0. Two reclassifications

**The existing planner is not "core, awaiting wiring".** It is:

> **Reusable but semantically unsafe and incomplete.**

It computes the right shape of answer and reports a dangerous one when it cannot. It is a starting
point, not an authority.

**`resource?: string` is a limitation of that calculator, not an architecture to preserve.** The
persistence model does not inherit it. A resource is a typed reference; a task may need several.

---

## 1. Invariants — NORMATIVE

These are rules, not explanatory notes. A change that violates one is a design regression.

```
Requirement          ≠  Booking
Booking              ≠  Availability
Availability         ≠  Actual

Proposal             ≠  Current Plan
Current Plan         ≠  Baseline

Project Membership   ≠  Resource Assignment
Resource Reference   ≠  Resource Ownership

Discipline           ≠  Trade / Resource Class

Later availability change  ≠  historical booking deletion
```

### 1.1 The temporal invariant

> A booking may have been valid when committed and become infeasible later. **The original
> commitment remains auditable; its current feasibility changes to `CONFLICTED` or `UNKNOWN`.**

Two distinct properties, and conflating them is the trap:

```
creation validity     settled once, at commitment, never revised
current feasibility   recomputed continuously against today's availability
```

This governs leave, breakdowns, capacity reductions, calendar changes and competing project
commitments alike. A later availability change never rewrites history and never rejects the owning
domain's change; it raises a visible conflict for a planner to resolve — replace the resource, raise
capacity, move the task, reduce the requirement, reschedule, approve overtime, or accept the
exposure. That resolution is itself recorded.

### 1.2 The four facts

```
Demand  ≠  Capacity  ≠  Booking  ≠  Actual
```

```
Capacity   12 electricians available Tuesday      ← a resource authority states it
Demand     Project A needs 8 · Project B needs 6  ← each project's plan states it
Bookings   A booked 8 · B booked 6  →  14 > 12    ← CONFLICT
Actual     A used 7 · B used 5                    ← Site records it, afterwards
```

No layer may be inferred from another.

### 1.3 The three prohibited false confidences

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

Projects must never become a hidden HR approval authority; HR must never delete a booking to make
numbers agree.

---

## 2. Feasibility is TRI-STATE — NORMATIVE (Amendment 2)

`overallocated: boolean` is retired as an authority contract. Feasibility is:

```
AVAILABLE    known capacity is sufficient for known demand
CONFLICTED   known capacity is insufficient — includes capacity 0 with positive demand
UNKNOWN      capacity or identity could not be established
```

Resolution rules:

```
UNKNOWN capacity              →  UNKNOWN feasibility
0 capacity + positive demand  →  CONFLICTED
sufficient known capacity     →  AVAILABLE
unresolved resource identity  →  UNKNOWN        (never "a different resource", never AVAILABLE)
```

`UNKNOWN` and a known zero are different facts and must never collapse into one another.

**This tri-state propagates end to end:**

```
domain  →  capacity engine  →  proposal  →  API  →  UI
```

**A proposal containing any `UNKNOWN` may not render a reassuring "resources available" state.**
This is the same rule §24 established for health coverage: a verdict that could not be reached is
reported as unreached, never as clean.

---

## 3. Authority boundaries

```
RESOURCE IDENTITY        HR Employee · Fleet Vehicle · Assets Asset · Procurement Supplier
                         Owned there. §22 REFERENCES, never copies.
WORKING CALENDAR         @aura/core CalendarService. Consumed, not re-implemented.
EMPLOYEE AVAILABILITY    HR Leave. Read as a fact; its lifecycle is never reinterpreted.
POOLS & CAPACITY         ResourcePool — see 3.1.
DEMAND & COMMITMENT      Projects: requirements, bookings, conflict detection.
EXECUTION ACTUALS        Site: LabourAllocation, PlantUsage. Untouched by §22.
```

### 3.1 ResourcePool authority — NORMATIVE (Amendment 1)

> **`ResourcePool` is an organization-scoped planning authority, currently implemented within the
> Projects bounded implementation because Resource Planning is its only proven consumer. It is not
> project-owned and carries no `projectId` ownership semantics. A Rule-of-Three review is required
> when another bounded context becomes a genuine consumer.**

```
              ResourcePool
              tenant / org scoped
                    │
          ┌─────────┴─────────┐
      Project A            Project B
      bookings              bookings
```

This is what makes cross-project capacity truthful without prematurely creating another module.

**A `ResourcePool` row carries no `projectId`.** Any future column, filter or API that scopes a pool
to a project is a violation of this statement, not an extension of it.

---

## 4. The five decisions

### DG-22.1 — Granularity: hybrid, anchored on a requirement — APPROVED

The unit of planning is a `ResourceRequirement`, not a person assignment. **Multiple requirements per
task are mandatory**, not optional:

```
Task "Pull cables — level 4"
├─ requirement   pool        ELV Technician    × 4 persons
├─ requirement   pool        Rigger            × 2 persons
└─ requirement   identified  Asset CR-01       × 1 unit
```

`ResourceRequirement` is **demand**. `ResourceBooking` is **commitment**. They are separate records,
because §1.2 requires it and because unsatisfiable demand must stay visible rather than silently not
existing.

### DG-22.2 — Identity: typed references, no duplicated masters — APPROVED

**`ResourceRef` equality is typed. Bare ids are never compared.**

```
ResourceRef {
  resourceType         'employee' | 'vehicle' | 'asset' | 'pool'
  canonicalResourceId  Id         the id in the OWNING register
}

equal(a, b)  ⇔  a.resourceType === b.resourceType && a.canonicalResourceId === b.canonicalResourceId
```

A vehicle and an asset that happen to share a uuid are not the same resource. Comparing bare ids
would make that indistinguishable.

**Copied names, plates and serials are never persisted as identity.** §22 stores no employee name,
no plate number, no asset serial. Labels are read through the owning register at display time, so a
renamed record is renamed everywhere and no second master can drift.

**Pools** are owned by Resource Planning and may declare their origin without being keyed by it:

```
ResourcePool { id, name: 'ELV Installation Crew A', unit: 'persons',
               sourceType: 'subcontractor' | 'internal', sourceId: <supplierId> | null, scope }
```

`supplierId ≠ poolId` — one subcontractor fields several crews. Supplier owns the subcontractor's
identity; Resource Planning owns the planning pool.

Cross-project conflict detection works on `ResourceRef` equality, which is why identified resources
must be typed ids and not strings.

### DG-22.3 — Capacity: unify the measurement contract, not the meaning — APPROVED

```
ResourceCapacity {
  resourceRef
  unit       'hours' | 'persons' | 'crews' | 'units'
  quantity   number | UNKNOWN          ← first-class; never 0, never Infinity
  interval   { from, to } or recurring
  calendarId which working calendar this quantity is expressed against
  scope      OrgNode reference
}
```

- Quantities in different units are **never summed**.
- A requirement whose unit does not match its resource's capacity unit **fails**. Implicit
  conversion is forbidden — it is how "4 persons" becomes "4 hours".
- `UNKNOWN` capacity yields `UNKNOWN` feasibility (§2), distinct from a known zero.

**Scope is an `OrgNode` reference.** The org tree exists, nests, and carries containment semantics.
§22 does **not** build on `branch_id` and does **not** create a Branch model.

### DG-22.4 — Persistence: the governed chain — APPROVED

```
Authored schedule
      ↓
Planning Run
      ↓
Solver Proposal
      ↓  explicit governed acceptance
Current Plan
      ↓  separately governed
Baseline
```

> **A solver run must never mutate current or baseline dates merely because it executed.**

Durations, dependencies, requirements and bookings are persisted — without them there is nothing to
plan from and no proposal can be saved, re-opened or compared. A computed result is not the plan's
truth: it is a proposal until accepted, and acceptance is a governed act. Dates carry their
provenance — authored, proposed, accepted, or baselined.

### DG-22.5 — Naming — APPROVED

```
Resource Pool          a governed pool of interchangeable capacity
Resource Capacity      what is available — per unit, per interval, per scope
Resource Availability  capacity minus known absences (leave, maintenance)
Resource Requirement   what a task needs                       (demand)
Resource Booking       a project's committed claim on capacity (commitment)
Resource Plan          the per-project picture of the above
Resource Conflict      committed > available, for one resource in one interval
```

`LabourAllocation` and `PlantUsage` are **reserved for Site actuals**, are not renamed, and are never
reused for planning. "Allocation" is never used for anything forward-looking.

---

## 5. Planner Correction Contract

### 5.1 Layering — NORMATIVE

Cross-project capacity is **outside** the pure levelling function.

```
HR / Assets / Fleet / Pools · Calendars · existing bookings across projects
                              ↓
                Capacity / Availability Resolver          ← does the querying
                              ↓
                    resolved planning facts               ← plain data
                              ↓
              Pure Planning / Levelling Engine            ← stays pure and deterministic
                              ↓
                          Proposal
```

> **`schedule-planning.ts` must not query HR, Fleet, Assets or other projects.** It receives resolved
> facts and returns a proposal. The existing engine is corrected and generalised; the cross-project
> capacity engine is a separate capability.

### 5.2 The nine requirements

The engine may present a feasibility verdict only once all nine hold. Each is a test, not a claim.

| # | Requirement | What it prevents |
|---|---|---|
| 1 | **Missing capacity → `UNKNOWN`**, never `capacity: 0, overallocated: false` | The false negative shipped today |
| 2 | **Unresolved identity is never silently matched** — same resource ⇔ equal typed `ResourceRef` | `TC-01` vs `Tower Crane TC-01` reading as two non-conflicting cranes |
| 3 | **Multiple requirements per task** | A task needing a crew *and* a crane being unrepresentable |
| 4 | **Cross-project commitments included** — via the Resolver, not by the engine querying | "Available ✓" on two screens for one crane |
| 5 | **The working calendar is consumed** (`@aura/core`), not assumed | Plans that work through Fridays and Eid |
| 6 | **Dependency cycles detected and reported** | Already present; must survive the rewrite |
| 7 | **Unschedulable demand reported, not dropped** | A silently ignored requirement reading as satisfied |
| 8 | **Deterministic** — identical input yields identical output, tie-breaks included | A plan that changes when nothing changed |
| 9 | **No false "available"** under any combination of missing capacity, unresolved identity or missing requirement | §1.3, as one end-to-end assertion |

### 5.3 Existing behaviour to retain

The current engine gets one thing right and it must survive: **a requirement greater than known
capacity is `CONFLICTED`, and delaying it indefinitely is not a solution.** A single task that alone
exceeds capacity is not delayed — delaying could never help — but it *is* reported. That is the
correct split between "levellable" and "reportable".

---

## 6. Implementation sequence — APPROVED

```
planner correction
  → persisted duration / dependencies
  → ResourceRef
  → ResourcePool / capacity
  → Requirements
  → Bookings
  → cross-project capacity engine
  → calendar integration
  → Planning Run / Proposal
  → governed acceptance
  → API / BFF
  → Project 360 UI
  → permissions / events / audit
  → browser evidence
```

The browser proof must walk the failure §22 exists for: two projects, one crane, the same Tuesday,
and a conflict visible on both.

---

## 7. Explicitly out of scope

**AURA-PM-002 — plan-vs-actual reconciliation is NOT part of §22.** Site's free-text trade and
equipment actuals cannot prove deterministic reconciliation. **The gap stays open rather than being
closed with manufactured string-based lineage.** §22 will answer *"is this crane double-booked?"* and
will not answer *"did we use the crane we planned?"*.

**AURA-ORG-001 — the `branch_id` finding stays separate.** No branch model is invented as part of
Resource Planning. `OrgNode` is the approved scope mechanism.

**Employee → pool membership lineage does not exist**, so approved leave reduces availability for
**named employees only**. Pool capacity is governed explicitly, with no automatic HR subtraction,
until that lineage exists.

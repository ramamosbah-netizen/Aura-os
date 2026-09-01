# PD-5C — Scope, Entry Criteria and Capability Sequence

**Status:** Proposed — planning only  
**Date:** 1 September 2026  
**Scope:** Project Delivery post-Gate-B planning; no implementation authorization

## Decision summary

PD-5B / Gate B is closed as PASS under the approved authority contract. PD-5C is therefore
eligible for scope planning, but it is **not automatically authorized for implementation**.
Sales & Commercial remains a prerequisite portfolio dependency: implementation must wait for
Sales final-closure evidence, or an explicit written waiver.

PD-5C must operationalize the already-proven delivery contracts. It must not reopen B1–B7,
introduce a second baseline/cost/EVM engine, or use Project Delivery as a reason to change
Sales.

## Proposed scope

PD-5C is the controlled operationalization of:

1. **Explicit delivery mapping** — bind frozen handover items to WBS/CBS through the governed
   `DeliveryItemMap` lifecycle before mapped execution facts are accepted.
2. **Execution quantity operations** — record installed/physical quantities and corrections
   through the existing Quantity Ledger authority; preserve SOLD, Certified and Billed as
   independent facts.
3. **WBS/CBS execution integration** — attribute quantities, progress and cost projections to
   the mapped project structure without making WBS/CBS an independent commercial authority.
4. **Quality and certification context** — expose the existing governed QA/IPC boundaries to
   delivery operators; Quality Approved remains distinct from Client Certified.
5. **Cost and EVM operational reconciliation** — consume Cost Ledger projections and the B7
   opening BAC/EVM contract; do not introduce time-phased PV, rebaseline, EAC or a second EVM
   engine.
6. **Project Delivery evidence and controls** — provide auditable, tenant-safe operational
   commands, replay/rebuild behavior and release evidence for the above capabilities.

These are capability boundaries, not permission to redesign every Project surface.

## Explicit non-goals

- No Sales or Commercial changes.
- No new `DeliveryBaseline` aggregate/table.
- No shared Direct/Tender `EstimateRevision` convergence.
- No automatic `DeliveryItemMap` creation in the Contract → Project reactor unless a later
  approved requirement changes the lifecycle decision.
- No time-phased PV engine, BAC rebaseline engine, EAC/ETC/VAC/TCPI.
- No destructive route retirement, writer removal or compatibility cleanup.
- No Project UI reconstruction authorization in this document.

## Entry criteria

### Hard technical invariants

| Criterion | Required evidence | Status |
|---|---|---|
| Gate B authority | Approved Gate-B acceptance contract and evidence matrix | PASS |
| Immutable handover | Snapshot/hash, original facts and replay semantics proven | PASS |
| Delivery mapping boundary | Explicit mapping command/service, frozen membership and tenant/project validation | PROVEN; operational scale to be verified |
| Quantity authorities | SOLD, Executed, Certified and Billed remain separate | PASS for tested scope |
| Progress authority | Mapped WBS uses installed/SOLD; unmapped leaf manual progress remains governed | PASS for tested scope |
| AC/EVM authority | Cost Ledger → projections; BAC/EV/AC/CV/CPI contract; PV/SV/SPI unavailable | PASS for tested scope |
| Security | PostgreSQL RLS, tenant isolation and permission boundaries | PASS for tested scope |
| Replay/rebuild | Quantity, cost and baseline replay/rebuild behavior is executable | PASS for tested scope |

### Portfolio and release gates

| Criterion | Rule | Status |
|---|---|---|
| Sales final closure | Sales architecture-critical fitness and main-checkout verification complete | **PENDING** |
| Canonical checkout | Work must run from `C:\Users\Jeet_intech\Desktop\aura-os` on `main` | ESTABLISHED |
| CI/release evidence | Classified separately from Gate B; required before release/production claims | NOT RUN / RELEASE-ONLY |
| PD-5C authorization | Requires explicit approval after the above review | NOT AUTHORIZED |

The Sales criterion is a coordination gate, not a reason to alter Sales during PD-5C.

### Current Sales dependency evidence

The latest repository-backed Sales audit records one high-severity workflow gap: the Tender
register and Tender 360 "Won" actions call the generic status endpoint, while the governed
backend requires the `award()` command with award evidence. The governed award endpoint exists,
but no current web surface captures and submits that evidence. This is a Sales-owned closure
item, not a PD-5C implementation task. PD-5C remains unauthorized until Sales closes it or an
explicit waiver accepts the dependency.

## Capability sequence

```text
PD-5C Entry Review
        ↓
C1 Mapping Operations
        ↓
C2 Execution Quantity Operations
        ↓
C3 WBS/CBS + Progress Operations
        ↓
C4 Quality / IPC / Certification Context
        ↓
C5 Cost / EVM Reconciliation Operations
        ↓
C6 Change Control and approved current-state effects (separate authorization)
        ↓
Project Delivery UI / workspace (separate authorization)
```

### C1 — Mapping Operations

Use the existing `DeliveryItemMapService` and persistence. Prove the explicit mapping command
is usable at project scale, auditable and idempotent. No automatic handover mapping and no
mutable Tender/CRM lookup.

### C2 — Execution Quantity Operations

Use the Quantity Ledger installed path for physical execution. Preserve append-only corrections,
UNKNOWN semantics and the separation from Certified/Billed. This slice must not redefine the
commercial SOLD fact.

### C3 — WBS/CBS and Progress Operations

Apply the B5 writer boundary: mapped quantity-controlled WBS is derived; derived parents reject
manual overwrite; eligible unmapped leaf WBS may use governed manual progress. CBS/WBS remain
projections where the approved contracts say so.

### C4 — Quality, IPC and Certification Context

Connect delivery users to existing Quality and Payment Certificate workflows without treating
Quality IR approval as Certified or certification as Billed. Any new correction semantics require
a separate decision if the existing command boundary is insufficient.

### C5 — Cost and EVM Reconciliation Operations

Consume canonical Cost Ledger actuals, reconcile CBS/WBS projections and expose B7 metrics. BAC
is the approved opening baseline; PV/SV/SPI remain unavailable until a separately approved
time-phased baseline exists.

### C6 — Change Control

Variations, corrections and future rebaseline effects require an explicit decision per change
type. Approved Variation must not silently rewrite original handover, SOLD, opening BAC or
historical ledger facts. This capability is **not authorized by the current plan**.

## Dependency graph

```text
Sales final closure / waiver
            │
            ▼
Gate-B PASS + disposable DB evidence
            │
            ▼
     C1 Delivery mapping
            │
            ▼
     C2 Installed quantities
            │
            ▼
     C3 Progress/WBS/CBS
            │
       ┌────┴────┐
       ▼         ▼
 C4 Certified  C5 Cost/EVM
       └────┬────┘
            ▼
      C6 Change control
            ▼
   separately approved Project UI
```

## Acceptance evidence for a future implementation authorization

Each capability must have its own bounded review with:

- repository owner and writer matrix;
- DB migration/RLS impact, or an explicit `NO MIGRATION` decision;
- authenticated HTTP/service proof;
- tenant and permission proof;
- replay/idempotency and correction/reversal proof;
- rebuild/reconciliation proof where a projection is involved;
- compatibility impact and rollback boundary;
- no regression to B1–B7 or Sales.

Gate B PASS is not reused as proof that these operational capabilities are implemented.

## Recommendation

```text
PD-5B Gate B                 PASS — CLOSED
PD-5C Scope Planning         COMPLETE
PD-5C Entry Criteria         DEFINED
PD-5C Implementation        NOT AUTHORIZED — Sales closure/waiver pending
Project UI                  NOT AUTHORIZED
Sales                       NO CHANGE
Release/Production          NOT ESTABLISHED — CI remains separate
```

The next decision is a narrow authorization review after Sales final closure (or an explicit
waiver). No PD-5C code, migration, route, writer or UI work is implied by this document.

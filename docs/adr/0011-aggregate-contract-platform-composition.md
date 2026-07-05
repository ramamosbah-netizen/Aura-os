---
id: adr_32b65779
number: 0011
title: AURA Aggregate Contract & Platform Composition
status: Accepted
category: Architecture
owner: Architecture
date: 
supersedes: []
related: [0004, 0006, 0010, 0012]
---

# ADR-0011: AURA Aggregate Contract & Platform Composition

**Status:** Accepted

## Context

AURA already separates a framework-free kernel (`@aura/shared`, `@aura/core`) from Nest-bound
business modules (ADR-0004). While designing the Engineering overhaul we found that three platform
capabilities in `shared/src` — **DMS** (`dms/document.ts`), **Events** (`events/event.ts`) and
**Workflow** (`workflow/workflow.ts`) — already address any business object by the *same* pair:

```
aggregateType: string
aggregateId:   Id
(+ tenantId, companyId)
```

This is not an implementation detail; it is an **emergent architectural contract**. The platform
does not know what a `Drawing`, `Invoice` or `Employee` is — it only knows an *addressable
aggregate*. The cross-module `Inbox` and `Search` already unify records across modules with **no
shared supertype**, proving that polymorphism here comes from the contract, not from a class tree.

Two tempting-but-wrong moves were considered and rejected:

1. A `BaseEntity` / `Entity → EngineeringEntity → Drawing` **inheritance hierarchy** giving every
   object workflow/attachments/comments/audit/AI/notifications by extension. This would couple the
   framework-free domain to platform services, breaking the kernel/module split (ADR-0004), and
   would rot into a God base class — the exact ERP disease we avoid.
2. Building a **meta-framework first**, before any real consumer. Framework-first is a leading
   cause of ERP failure.

## Decision

We ratify the contract that already exists and forbid the inheritance path. Four layers, built in
strict order of proof:

**Layer 1 — Vocabulary (fixed now; it is the system's language, not a library).**
`Business Aggregate` (not "Entity"), `Platform Capability` (not "Shared Service"),
`Business Module` (not "Feature"), *Aggregate address* = (`aggregateType`, `aggregateId`),
*Dimensions* (see ADR-0012), *Ownership* = the single module that owns an aggregate's business
process.

A **Business Aggregate** owns business invariants, lifecycle and consistency boundaries (DDD sense).
The contract *identifies* an aggregate; it never *defines* its behaviour — `(aggregateType,
aggregateId)` is the aggregate's **address**, not the aggregate itself. A **Platform Capability**
names a cross-cutting concern (Workflow, DMS, Events…); its concrete runtime is a *capability
service*, and the term is unrelated to capability-based *permissions*.

**Layer 2 — Contracts (fixed now; already proven by 3 consumers).** Capabilities bind to aggregates
through *interfaces the aggregate satisfies*, never a base class it extends:

```ts
interface BusinessAggregate {
  aggregateType: string;
  aggregateId: Id;
  tenantId: Id;
  companyId: Id | null;
  // shared dimensions, optional per aggregate:
  projectId?: Id;
  discipline?: string;
  costCenter?: string;
}
```

Capability-facing contracts (`DocumentSubject`, `WorkflowSubject`, `EventSource`) are just the
address. A `Drawing` **satisfies** the contract; it does not inherit anything.

**Layer 3 — Platform Capabilities.** Cross-cutting services that operate on *any* aggregate via its
address and never branch on concrete type. Established: **DMS, Events, Workflow, Notifications**
(the last already references `refType`/`refId`). Candidates: **Timeline/Activity, Comments,
Approval record.**

**Layer 4 — Frameworks.** Higher abstractions (Approval Engine, generic Comment/Activity service)
are **extracted only under the Rule of Three below** — never authored speculatively.

### Binding rules
1. **Ownership of mutation.** Only the owning module may mutate an aggregate's business state.
   Platform capabilities never mutate business state directly — they emit commands/events the owner
   reacts to (per ADR-0004). Workflow sends a command; Finance is what changes an `Invoice`.
2. **Capability statelessness (business semantics).** A capability may persist *technical* metadata
   (document versions, workflow instances, comments, the event log) but never *business truth*.
   Workflow knows `Approved`; it never knows `Invoice Paid` — that truth belongs to Finance.
3. **Capability independence.** Capabilities do not depend on one another. Each talks only to the
   `BusinessAggregate` contract, never to another capability — Comments does not know Workflow,
   Workflow does not know DMS. The topology is a **star around the aggregate, not a chain.**

### Rule of Three
No shared abstraction or platform capability may be extracted before it is exercised by **three
independent consumers**. Corollary: a *contract* (Layer 1–2) may be fixed early only once it
already has three proven consumers — as the aggregate address does today (DMS + Events + Workflow).
**Exception:** an abstraction may be fixed early when it is required to *preserve an existing
architectural invariant* rather than because it is merely *useful* — which is exactly why the
address contract, already implicit across three capabilities, is ratified now.

## Consequences

+ Any new business object gets platform capabilities by *satisfying the contract* — define its
  business behaviour only; workflow, documents, events, notifications, timeline attach for free.
+ Domain stays framework-free; kernel/module separation (ADR-0004) is reinforced, not weakened.
+ `Inbox`, `Search`, `discipline` filters, per-dimension permissions and reports all work off one
  vocabulary instead of N bespoke shapes.
+ Framework-first risk is structurally blocked by the Rule of Three.
- Cross-cutting behaviour is composed at the app/platform layer, not inherited — slightly more
  wiring per capability than a base class would give (accepted; it is the price of decoupling).
- Shared dimensions (including the currently-inconsistent `discipline`) — which are mandatory,
  who owns each, and whether they are mutable — are specified separately in **ADR-0012 (Shared
  Dimensions)**. This ADR fixes only that dimensions *attach to the aggregate*, not their rules.
- ABAC over the four permission dimensions (role + capability + scope + discipline) is endorsed as
  an *additive* policy layer on the existing workspace/roles engine, added when the first real rule
  needs it — not a rewrite, and not built ahead of that need.

## Related
ADR-0002 (transactional outbox / events), ADR-0003 (dual-runtime adapters),
ADR-0004 (no module-to-module imports), ADR-0006 (forms are JSON), ADR-0010 (RLS early, enforced last),
ADR-0012 (shared dimensions).

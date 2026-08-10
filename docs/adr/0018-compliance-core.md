---
id: adr_5159e3fc
number: 0018
title: Compliance Core
status: Accepted
category: Architecture
owner: Architecture
date: 2026-08-10
supersedes: []
related: [0011, 0012, 0002, 0004]
---

# ADR-0018: Compliance Core

**Status:** Accepted · **Date:** 2026-08-10

Fixes the model for authority compliance (gap register **G-20**) so that SIRA and DCD are *data on
a shared core*, not two modules. Grounded in [the G-20 discovery](../reports/2026-08-10-g20-compliance-discovery.md),
which surveyed what already exists before any of this was designed.

## Context

An ELV contractor cannot legally operate a security or fire system in Dubai without authority
approval — SIRA for security systems, DCD for fire and life safety. AURA models none of it:
`SIRA`, `DCD` and "civil defence" return **0 files** across the whole tree. That is a market-entry
blocker, not a missing screen.

The forces that shape the decision:

1. **N-03 has fired five times.** A second `IdempotencyService`, a second AR billing cap, a second
   PO field diff, a second AMC reactor, and an `ElvSystem` taxonomy that had already forked
   in-repo. Compliance is the largest new surface since that count started and is the most likely
   to make it six.
2. **Four things already exist that compliance would otherwise rebuild** — evidence
   (`DocumentRequirement` + DMS), the state machine (`WorkflowService`), the audit trail
   (`AuditService`), and expiry (consolidated into `@aura/shared` immediately before this ADR).
3. **Three approval-shaped lifecycles were hand-rolled** — two `Submittal` models and
   `MaterialApproval` — none using the kernel workflow engine that exists for it.
4. **The regulatory content is not known.** Which documents, which fees, which validity periods is
   published by the authorities and has not been researched. It must not be invented.

## Decision

### 1 · A Compliance Core, not a SIRA/DCD module

One domain, `modules/compliance`. SIRA and DCD are **reference data plus rules** on top of it.
Adding Trakhees or ADCDA later must be data and configuration — no new aggregate, no new table, no
schema redesign. That is the acceptance test for this ADR.

**Why not an existing model.** Three candidates were considered and rejected, each for a reason of
domain rather than convenience:

| Candidate | Why it is not this |
|---|---|
| `doccontrol.Submittal` | A controlled document sent to the **consultant** for review, returning a code A–D. No expiry, no statutory force, no inspection, and the codes are a consultant convention. Rejecting a shop drawing and being refused a DCD certificate are not the same event. |
| `quality.InspectionRequest` / `ITP` | Models **us** inspecting **our** workmanship, by our QA/QC, against our plan. An authority inspection is **a regulator inspecting us** — different actor, different outcome vocabulary (`pass / conditional / fail` with a re-inspection date), and legal rather than contractual consequence. Same English word, different domain. |
| `hse.PermitToWork` | Site-safety authorisation to perform an activity, with a validity window. Genuinely close in *shape*, which is why it was considered — but it is issued internally for a task, not by a statutory body for a system, and it does not certify anything. |

Also rejected: `contracts.PaymentCertificate`, which shares only the word "certificate" and is a
money instrument.

### 2 · The canonical model

```
        Applicability (context → what is required)
                    │
                    ▼
        ComplianceObligation ── "this system must hold SIRA system certification"
                    │
                    ▼
          ComplianceCase ── the unit of work, per subject
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   Submission   Inspection   Decision        (inspection OPTIONAL)
        │           │           │
        └───────────┼───────────┘
                    ▼
              Certificate  ──►  expiry / renewal
                    │
                    ▼
      Evidence: kernel DocumentRequirement → DMS Document
```

### 3 · `ComplianceRequirement` is **not** `DocumentRequirement`

The distinction is load-bearing and is the one most likely to be lost:

| | says |
|---|---|
| **`ComplianceObligation`** | *this system must comply with obligation X* — a statutory duty |
| **`DocumentRequirement`** (kernel, existing) | *I need document Y, and here is the evidence I have it* |

An obligation is discharged **through** evidence; it is not made of evidence. `DocumentRequirement`
stays what its own header says it is — an evidence mechanism — and must not drift into being the
compliance engine. Compliance references it; compliance is not built out of it.

### 4 · `Authority` is reference data, not an enum

A table, not a union type:

```
Authority: id · code · name · jurisdiction · portalUrl · active
```

Seeded with SIRA and DCD. **No `OTHER` member** — an `OTHER` in a closed enum becomes the bucket
everything unclassifiable falls into, and a year later nobody can say what is in it. An authority
that is not yet modelled is a row that has not been added, which is a visible, fixable state.

### 5 · Applicability is obligation-aware, not `emirate × system`

`(jurisdiction, system) → authority` is too thin: one authority issues several distinct approvals
(security plans, system certification, equipment certification are separate SIRA services). The
rule resolves to **which obligations apply**, not merely which body is involved:

```
(jurisdiction, system, project/facility context) → ComplianceObligation[]
```

The rule engine's job is *what is required here*, and only incidentally *who requires it*.

### 6 · Scope is `scope + subjectType + subjectId`, never nullable foreign keys

SIRA licenses the **company** and cards **technicians**; DCD does not. A case therefore attaches to
different kinds of subject:

```
scope: PROJECT | COMPANY | PERSON
subjectType, subjectId
```

Not `projectId?` + `companyId?` + `personId?`. Three nullable columns is a polymorphic-FK smell
that produces rows where all three are null and no constraint can catch it. The **service** enforces
the invariant that `subjectId` resolves against the type its `scope` names.

### 7 · `ComplianceDecision` is its own append-only entity

Not a status field on the case. The real sequence is:

```
submitted → rejected → resubmitted → approved
```

If the case only carries `status = approved`, the first decision — and the reason for it — is gone.
That is the legal history, and it is exactly what a dispute turns on. Each decision records
`decisionDate`, `decisionBy`, `reference`, `outcome`, `conditions`, `reason`, and its evidence.

### 8 · Inspection is optional, not a mandatory stage

```
Submission → [Inspection?] → Decision
```

Not every obligation requires a site visit. Whether one is needed comes from the applicability rule
(`requiresInspection`), and an inspection carries its own record: requested / scheduled / conducted
dates, inspector and inspection references, outcome (`pass | conditional | fail`), notes, and
whether re-inspection is required with its date.

### 9 · Certificates are append-only; renewal is a new row

A renewal never edits an expiry date. "What was valid on 14 March" is a legal question, and
mutating the row destroys the only answer. A case holds a *series* of certificates over its life.

### 10 · Device coverage is explicit

```
ComplianceCase
 ├── projectId + system      ← the natural grain: "the CCTV system on Villa 1A"
 └── coverage: ALL_SYSTEM_DEVICES | SELECTED_DEVICES (+ deviceIds when SELECTED)
```

A bare `deviceIds[]` has no semantics — an empty array cannot be distinguished from "covers
everything". Explicit coverage also survives a device being added after approval: under
`ALL_SYSTEM_DEVICES` the new device is in scope and the case is the thing to re-check.

### 11 · Reuse, stated so it is not re-litigated

| Concern | Uses |
|---|---|
| Evidence | kernel `DocumentRequirement` (`entity_type`/`entity_id`, already generic) → DMS `Document` |
| State transitions | kernel `WorkflowService` — RBAC/ABAC-enforced, emits `workflow.*` |
| Audit | `AuditService` → `aura_audit_log`, field-level before/after |
| Expiry | `@aura/shared` `expiry.ts` — consolidated from four copies immediately before this ADR |
| Tenant isolation | RLS enabled + **FORCED** + policied per 0163/0164; every store read takes `tenantId` explicitly |

### 12 · Not in G-20

Named so scope does not drift: certificate **document generation**, authority **portal
integration** (no public API is assumed to exist), automated fee payment, technician card issuance
workflow, and any authority beyond SIRA and DCD.

### 13 · Regulatory content requires a sourced register

No requirement, fee or validity period is seeded without:

```
source · sourceVersion/edition · retrievedAt · authority
```

Un-sourced regulatory data is worse than none: it looks authoritative and will be relied on. If
the source is unavailable, the row is not created.

## Consequences

**Easier**

+ Adding an authority is reference data and rules, not a schema change — the test this ADR sets.
+ Commissioning gains witnessed sign-off as compliance evidence; handover gains an "are all
  certificates valid" gate; AMC gains a renewal trigger.
+ Expiry, evidence, workflow and audit each have one implementation with several consumers.
+ The legal history survives: every decision and every certificate is kept, not overwritten.

**Harder / accepted costs**

- Five new tables (authorities, cases, submissions, inspections, certificates). Each justified
  against reuse in the discovery's pre-migration gate.
- An append-only certificate series is more query work than a mutable expiry column, and the UI
  must show "current" rather than "the row".
- The `scope`/`subjectType` invariant is enforced in the service, because no single FK can express
  it. That is a deliberate trade against three nullable columns.
- G-20 cannot ship complete until the regulatory register is sourced. **That is a schedule
  dependency on information, not on engineering**, and it is stated here rather than discovered
  late.

**Follow-ups**

- Kernel tenant budget: `KERNEL_RATCHET = 10` in `apps/api/src/tenant-isolation.fitness.test.ts`.
  Compliance must not raise it.
- `ap-aging`, `ar-aging` and `projects/schedule` still carry their own copy of the day arithmetic
  for a different question; `daysBetween` would serve them.
- The two `Submittal` models and `MaterialApproval` remain hand-rolled rather than using
  `WorkflowService`. Out of scope here; recorded so the debt is visible.

## Related

ADR-0011 (aggregate contract), ADR-0012 (shared dimensions — the Rule of Three applied to
`expiry` and `ElvSystem`), ADR-0002 (events), ADR-0004 (ports & adapters, used for the
cross-context reads compliance needs).

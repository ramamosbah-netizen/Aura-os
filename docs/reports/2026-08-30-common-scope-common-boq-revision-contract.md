# Common Scope + Common BOQ Revision Contract

**Phase:** 2.5 — Target Architecture Alignment
**Status:** **Gate 0 APPROVED** as a logical design contract; no persistence, route, or writer change authorized
**Decision intent:** Define one logical Commercial Scope → BOQ Revision boundary while preserving Direct and Tender source semantics.

## Requirement

Sales & Commercial needs one downstream definition chain:

`Opportunity/Tender source → Commercial Scope → BOQ Revision → Estimate Revision → Quotation Revision`.

The contract must allow Direct and Tender work to converge without assuming that either the current
CRM `SolutionScope` or Tendering `BOQ` is already the final physical owner. Existing implementations
remain operational through adapters until parity and migration gates pass.

## Current architecture evidence

| Concern | Direct / CRM today | Tendering today | Contract implication |
|---|---|---|---|
| Source | Opportunity, requirements, `SolutionScope`, governed Pre-Award package | Tender, requirements, clarifications/addenda and Tender 360 | Preserve `sourceType` and `sourceId`; never erase source lineage. |
| Scope | `SolutionScope` lines with discipline, description, unit, quantity and optional unit price | Tender requirements and BOQ scope | Normalize into a logical Commercial Scope; current stores are adapter candidates. |
| BOQ | No equivalent hierarchy-first BOQ aggregate on the Direct path | `BOQ`/`BOQItem` with item code, quantity, unit, IFC reference and pricing integration | Tender BOQ is the strongest starting implementation, not a Tender-only target. |
| Revision | `EstimationBasisRevision` freezes source lines and preserves provenance | BOQ is currently mutable per Tender; no equivalent common revision aggregate | Introduce a logical immutable revision contract before physical convergence. |
| Cost / price | Direct governed chain separates estimate cost, recommendation and quotation price | Tender `RateBuildUp` includes sourcing and currently derives selling rate | BOQ must not become the owner of customer price or approved commercial truth. |

## Logical ownership

- **CRM** owns the Direct commercial source and customer context. Its current Scope implementation is
  an input adapter candidate, not a pre-selected permanent owner of Common Scope.
- **Tendering** owns Tender source/governance: qualification, clarifications, addenda, submission and
  award. Its current BOQ is the strongest implementation seed and remains available through an adapter.
- **Commercial Scope / BOQ** is one logical downstream capability. Physical module/store ownership is
  deliberately deferred until Gate 0 disposition is approved.
- **Estimation** consumes an approved BOQ revision and owns cost build-up, sourcing evidence,
  estimated cost and recommended price.
- **Quotation** owns customer price, commercial revisions, approval and external issue/submission.

## Common Scope contract

### Scope revision envelope

```text
CommercialScopeRevision {
  id: UUID
  tenantId: UUID
  companyId: UUID | null
  sourceType: DIRECT | TENDER
  sourceId: UUID                 // Opportunity for DIRECT; Tender for TENDER
  sourceRevisionRef: string | null
  revisionNo: positive integer
  status: DRAFT | APPROVED | SUPERSEDED
  title: string
  requirements: ScopeRequirement[]
  lines: ScopeLine[]
  createdBy: UUID | null
  createdAt: ISO-8601
  approvedBy: UUID | null
  approvedAt: ISO-8601 | null
}
```

```text
ScopeLine {
  id: UUID
  sourceLineId: UUID | null       // original SolutionScope/Tender requirement line
  discipline: string | null
  description: non-empty string
  unit: string
  quantity: decimal | null        // null means unknown, never zero by inference
  parentLineId: UUID | null
  requirementRefs: UUID[]
  sourceRef: string | null        // drawing, IFC, clarification or other evidence
}
```

Scope answers **what is to be delivered**. It may contain qualitative requirements and unmeasured
lines while in draft. Approval is refused until every line required for pricing has a known quantity.
Scope does not own resource cost, margin, recommended price or customer price.

### Scope lifecycle invariants

1. A revision starts as `DRAFT`; only a draft can be edited.
2. Approval creates an audit fact and freezes the revision used downstream.
3. A change after approval creates the next revision; it never mutates the approved revision.
4. Every line retains its source provenance when edited or projected.
5. `sourceType` is explicit (`DIRECT` or `TENDER`) and cannot be inferred from labels.
6. Tenant and company scope are enforced at every read and command boundary.

## Common BOQ Revision contract

### BOQ revision envelope

```text
BOQRevision {
  id: UUID
  tenantId: UUID
  companyId: UUID | null
  scopeRevisionId: UUID
  sourceType: DIRECT | TENDER
  sourceId: UUID
  revisionNo: positive integer
  status: DRAFT | APPROVED | SUPERSEDED
  items: BOQItem[]
  createdBy: UUID | null
  createdAt: ISO-8601
  approvedBy: UUID | null
  approvedAt: ISO-8601 | null
}
```

```text
BOQItem {
  id: UUID
  itemCode: string
  parentItemId: UUID | null
  scopeLineId: UUID | null
  description: non-empty string
  category: string | null
  quantity: decimal | null
  unit: non-empty string
  ifcGuid: string | null
  sourceRef: string | null
  costCode: string | null
  referenceRate: decimal | null
}
```

The common contract intentionally separates measurable definition from money ownership:

- `quantity`, `unit`, hierarchy and source references are BOQ truth.
- `referenceRate` is optional source evidence only; it is not the approved selling price.
- Estimated cost and recommended price belong to Estimate Revision.
- Customer price, discount, terms and validity belong to Quotation Revision.
- A BOQ revision with an unknown quantity may remain a draft, but cannot be approved or used to
  produce an approved estimate. Unknown is never treated as zero.

### BOQ lifecycle invariants

1. A BOQ revision is created from exactly one Scope revision.
2. A revision starts as `DRAFT`; only a draft can add, edit or remove items.
3. Approval requires a valid Scope revision and known quantities for all priceable items.
4. Approved or superseded revisions are immutable. A change creates `revisionNo + 1`.
5. Item hierarchy is acyclic; `parentItemId` must resolve inside the same revision and tenant.
6. Item codes are unique within a revision and remain stable across projections where possible.
7. Every item retains `scopeLineId`/`sourceRef` provenance; adapters may add evidence but may not
   silently replace the source.
8. Approval is the BOQ freeze boundary: `APPROVED` and `SUPERSEDED` revisions are immutable whether
   or not they have been referenced by an Estimate Revision. Downstream Estimate use additionally
   requires the exact revision ID plus a snapshot hash (or equivalent immutable projection) so later
   source edits cannot rewrite the estimate basis.

## Direct and Tender adapter mapping

| Source | Adapter input | Common output | Preservation rule |
|---|---|---|---|
| Direct governed Pre-Award | `EstimationBasisRevision` / Direct requirements | `CommercialScopeRevision` then `BOQRevision` | Preserve `packageId`, `opportunityId`, basis revision and each `sourceLineId`. |
| Direct legacy `SolutionScope` | Approved `SolutionScope` lines | Draft Scope/BOQ projection requiring normal approval gates | Do not silently treat legacy scope as governed; retain legacy marker and provenance. |
| Tendering | Tender requirements + current `BOQ`/`BOQItem` | `CommercialScopeRevision` then `BOQRevision` | Preserve `tenderId`, item codes, hierarchy, IFC links, quantities and source evidence. |

Tender RFQ, supplier quotes, stale detection, restamp and unsource remain Tendering/Estimation
capabilities attached to BOQ items; they are not removed or flattened into customer quotation data.

## Downstream lineage

```text
CommercialScopeRevision
        ↓ approved
BOQRevision
        ↓ approved / referenced
EstimateRevision
  ├── boqRevisionId
  ├── cost build-up + sourcing evidence
  ├── estimatedCost
  └── recommendedPrice
        ↓ snapshot/reference
QuotationRevision
  ├── estimateRevisionId
  ├── customerPrice
  └── approval → external issue/submission → immutable
```

Any change to approved Scope or BOQ creates a new revision and requires a new Estimate/Quotation
revision as applicable. Historical approved, issued or contracted truth is never recalculated in place.

## API and event boundary (design only)

This document defines a capability contract, not new endpoints. Existing Direct and Tender endpoints
continue to serve their current owners while adapters are evaluated. Any future common API must:

- expose tenant-scoped read and command boundaries;
- support idempotency for create/approve/revision commands;
- return stable revision IDs and provenance;
- use the existing error taxonomy;
- emit or map existing domain/audit events without creating duplicate facts;
- support bounded list/read projections for reporting.

No event names, routes or database tables are added by this contract alone.

## Security and audit requirements

- Tenant isolation and record-level ownership are enforced server-side; UI visibility is not a control.
- Scope/BOQ write, approve and read permissions are distinct and mapped to the owning source context.
- Approval is segregated from the creator where the current governance policy requires it.
- Every create, edit, approve, supersede and adapter projection records actor, tenant, source revision
  and correlation/audit metadata.
- Cross-tenant source IDs resolve as not found, never as an observable authorization distinction.

## Migration strategy

1. **Read-only parity audit:** compare Direct legacy, Direct governed and Tender BOQ fields, lifecycle,
   permissions, audit and downstream generation.
2. **Adapter proof:** project both sources into the contract in memory/read models; no writer or table
   change.
3. **Lineage proof:** show Scope → BOQ → Estimate → Quotation references and immutable snapshots.
4. **Dual-read comparison:** compare totals, item counts, hierarchy and provenance under bounded,
   tenant-scoped queries.
5. **Gate decision:** choose adapter topology or physical convergence. Do not rename a current table
   into the common owner by assumption.

Rollback is removal of the adapter/read projection; current Direct and Tender stores remain untouched.

## Gate 0 approval record

The following checklist was approved on 30 August 2026:

- Common Scope envelope and lifecycle — **APPROVED**.
- Common BOQ Revision, hierarchy and quantity semantics — **APPROVED**.
- `referenceRate` is non-authoritative for customer price and margin — **APPROVED**.
- Direct legacy, Direct governed and Tender mappings — **APPROVED**.
- Estimate → Quotation lineage and immutable revisions — **APPROVED**.
- Tenant, permissions, audit, idempotency and boundedness — **APPROVED as design contract**.
- Physical owner/topology — **DEFERRED intentionally to Phase 3B**.

## Acceptance criteria for Gate 0 (recorded)

- [x] Common Scope envelope and lifecycle approved.
- [x] Common BOQ Revision envelope, hierarchy and quantity semantics approved.
- [x] `referenceRate` is explicitly non-authoritative for customer price and margin.
- [x] Direct legacy, Direct governed and Tender mappings are accepted row-by-row.
- [x] Estimate and Quotation lineage references are accepted, including immutable revision behavior.
- [x] Tenant, permission, audit, idempotency and boundedness requirements are accepted.
- [x] Physical owner/topology remains a separate decision; no migration is implied.

## Recommendation

This is approved as the **logical Common Scope + Common BOQ Revision contract** for Phase 2.5 Gate 0.
Reuse Tender BOQ hierarchy and Direct revision/provenance concepts through adapters first. Defer any
physical Shared BOQ/Estimation migration until parity, HTTP, database and CI evidence prove that the
contract preserves every existing capability.

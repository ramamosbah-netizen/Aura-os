# Pre-Award Cross-Domain Architecture

**Status:** Adopted for the current Sales & Commercial UI
**Scope:** Tender 360 before award; no new suite and no duplicate domain writer

## Decision

`Tender 360` is a contextual workspace inside **Sales & Commercial**. It coordinates
qualification, scope, BOQ, estimation, clarifications and submission, and links the
specialist context required to prepare a bid. It does not take ownership of Engineering,
Planning, Supply Chain, Documents, Approvals or Contracts records.

The governing rule is:

> One record, one canonical owner, many contextual views.

## Ownership

| Capability | Canonical owner | Tender 360 role |
|---|---|---|
| Tender lifecycle, bid/no-bid, scope and BOQ | Sales & Commercial | own and operate |
| Estimation and quotation | Commercial authority | link/read context |
| Drawings, RFIs and technical submissions | Engineering | link to source workspace |
| Tender programme and milestones | Planning | link to source workspace |
| Vendor/material enquiry | Supply Chain | link to source workspace |
| Controlled files and evidence | DMS | link to canonical DMS |
| Approval decisions | Approval authority | link to decision queue |
| Contract negotiation, signing and closeout | Contracts | link after governed award |
| Activity and history | Audit/Activity authority | contextual readback |

## Pre-award to post-award lineage

```text
TENDER 360
    ↓ governed award / handover
PROJECT 360
```

Records created before award retain their canonical authority. Award may add a permitted
Tender → Project association/lineage where the owning domain supports it; it must not copy
the same drawing, programme or document into a second table.

The tender programme is an input to project planning, not an approved project baseline by
default. Budgetary/vendor enquiries remain distinct from committed project procurement.

## UI boundary

The Tender 360 page exposes links and contextual state for Technical, Tender Plan,
Documents & Evidence, Approvals and Award & Contract. Empty, unavailable or not-yet-
established source data is shown honestly; no metrics are fabricated in the context layer.

No `TenderEngineeringService`, `TenderProcurementSuite`, duplicate schedule, duplicate
document store or generic pre-award readiness writer is authorized by this decision.

## Verification

- The Tender 360 context is rendered on `/tendering/tenders/[id]`.
- BOQ, qualification and clarifications remain the existing Sales-owned writers.
- Specialist cards deep-link to `/engineering`, `/projects/schedule`, `/procurement`,
  `/documents`, `/my-work/approvals` and the Contracts register.
- No migration or database schema change is introduced by this UI boundary.

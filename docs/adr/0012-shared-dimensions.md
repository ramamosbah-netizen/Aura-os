---
id: adr_340c2ce8
number: 0012
title: Shared Dimensions
status: Accepted
category: Architecture
owner: Architecture
date: 
supersedes: []
related: [0011, 0002, 0010]
---

# ADR-0012: Shared Dimensions

**Status:** Accepted

## Context

Every Business Aggregate (ADR-0011) carries cross-cutting **dimensions** used for scoping,
filtering, permissions (ABAC) and reporting. Today they are applied ad hoc: `tenantId`/`companyId`
are consistent across `shared` capabilities; `projectId` is common; `discipline` exists on BIM
models and Technical Queries but is **absent** on Drawings/RFIs/Submittals; `costCenter`,
`currency`, `businessUnit`, `location` are unstandardised. Without one registry — with an owner and
a mutability rule per dimension — filters, permissions and reports fracture into N bespoke shapes,
and the inconsistency (e.g. `discipline`) silently breaks cross-module views.

Dimensions are **attributes on the aggregate** (Layer-1 vocabulary of ADR-0011), never entities of
their own, and never duplicated business data.

## Decision

We ratify a single **dimension registry**. Each dimension has exactly one owning module, a
mandatory/optional status, and a mutability rule. A change to a *scoping* dimension emits a domain
event (ADR-0002) so dependent contexts react; ABAC policies read dimensions as attributes.

| Dimension | Status | Owner | Mutability |
|---|---|---|---|
| `tenantId` | Mandatory (all) | Platform / Identity | Immutable |
| `companyId` | Mandatory (nullable only at tenant scope) | Org / Identity | Immutable after set (transfer = explicit, audited) |
| `projectId` | Optional (mandatory for delivery aggregates) | Projects | Mutable via reassignment → emits event |
| `discipline` | Optional (mandatory for Engineering aggregates) | Engineering | Mutable until first approval, then frozen |
| `costCenter` | Optional | Finance | Mutable → emits event |
| `currency` | Optional (see multi-currency) | Finance | Immutable after first posting |
| `businessUnit` | Optional | Org | Mutable |
| `location` | Optional | Projects / Org | Mutable |

Rules:
1. **Single owner.** Exactly one module owns each dimension's meaning and allowed values; other
   modules read it, never redefine it.
2. **Attribute, not entity.** A dimension is a field on the aggregate address/body, resolved
   against the owner's registry — not a foreign business record copied in.
3. **Scoping changes are events.** Mutating a scoping dimension (`projectId`, `companyId`,
   `costCenter`) emits an event; capabilities and reports re-scope from it.
4. **ABAC reads dimensions.** Permission policies (role + capability + scope + discipline) evaluate
   dimensions as attributes; they do not hard-code entity types.

## Consequences

+ One vocabulary for scoping/filtering/permissions/reporting across every module.
+ `discipline` becomes a first-class, consistent dimension — enabling per-discipline filters,
  KPIs, engineer assignment and ABAC.
+ New dimensions are added in one place with an explicit owner and mutability rule.
- Requires a **normalisation pass**: backfill `discipline` (and the address/dimension fields) onto
  aggregates that lack them today — a schema migration + data backfill, sequenced before UI that
  relies on them.
- Mutability rules (e.g. `currency` immutable after posting, `discipline` frozen after approval)
  must be enforced by the owning module, not assumed.

## Related
ADR-0011 (aggregate contract & platform composition), ADR-0002 (events),
ADR-0010 (RLS early, enforced last).

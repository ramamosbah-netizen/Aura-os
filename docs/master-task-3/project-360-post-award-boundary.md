# Project 360 — Post-Award Experience & Ownership Gate

**Status:** Architecture/IA baseline adopted for the next implementation gate
**Scope:** Post-award project delivery; no authority or persistence rewrite

## Requirement

The product must make the business boundary obvious:

- **My Work** answers “what do I need to do?” across AURA OS.
- **Sales & Commercial** answers “can we win this work?” through award.
- **Projects** answers “what are we delivering?” after governed award.
- **Project 360** is the primary workspace for one project.
- **Supply Chain, Finance, People, Documents and specialist domains** remain canonical owners.

Delivery Operations must not become a third personal/work queue or a duplicate Project 360.

## Target experience

```text
MY WORK          → personal attention across all authorities
SALES            → enquiry → tender → proposal → negotiation → award
PROJECTS         → project register → Project 360 → delivery and closeout
```

Project 360 provides one project context with grouped navigation:

```text
Overview | Setup | Scope & Contract | Plan & Schedule | Engineering
Procurement | Subcontracts | Site | Quality | HSE | Resources
Commercial & Cost | Changes & Claims | Documents
Testing & Commissioning | Handover | Activity & History
```

These are contextual entry points. They do not transfer record ownership.

## Route disposition (no deletion in this gate)

| Existing surface | Disposition | Rationale |
|---|---|---|
| `/operations/overview` | **COMPATIBILITY / specialist portfolio view** | Keep while the Project 360 hub is composed; it is not a personal queue. |
| `/operations/reports` | **KEEP SPECIALIST / read model** | Cross-project operational reporting remains useful when sourced from canonical records. |
| `/engineering` | **KEEP SPECIALIST + EMBED CONTEXT** | Cross-project engineering view; Project 360 links to the same Engineering authority. |
| `/site/control` | **KEEP SPECIALIST + EMBED CONTEXT** | Field execution authority; Project 360 supplies the project lens. |
| `/quality/control` | **KEEP SPECIALIST + EMBED CONTEXT** | Quality authority; one NCR/inspection lifecycle, many contextual views. |
| `/hse/control` | **KEEP SPECIALIST + EMBED CONTEXT** | HSE authority; Project 360 provides project navigation and readback. |
| `/commissioning` | **KEEP SPECIALIST + EMBED CONTEXT** | Testing/commissioning authority; no duplicate system records. |
| `/handover` | **KEEP SPECIALIST + EMBED CONTEXT** | Handover authority; Project 360 exposes project readiness and actions. |
| `/operations/pre-execution` | **COMPATIBILITY / drill-down** | Readiness projection, not a new top-level business module. |

No route is retired until a replacement Project 360 entry point is implemented and browser-
verified. No API, table or canonical writer is removed by this gate.

## Subcontract boundary

Subcontracting is a post-award project workflow distinct from client-side Sales Tender and
Supply Chain purchasing:

```text
PROJECT 360
  → Subcontracts
  → Package / scope / BOQ / drawings
  → RFQ / bidders / clarifications
  → technical + commercial evaluation
  → recommendation / approval / award
  → subcontract execution / certification / variations / closeout
```

The existing Subcontracts authority remains the first source to inspect. Reuse is preferred;
only a proven bounded extension may be added. Bid attachments are not silently promoted to
approved project drawings, and an awarded package does not duplicate the project’s Quality,
HSE, Documents, Certification or Variation authorities.

## Ownership rules

```text
ONE RECORD · ONE CANONICAL OWNER · MANY CONTEXTUAL VIEWS
```

Project 360 may compose actions and links, but each action must route to the owning API,
permission model, audit/event stream and readback surface. Readiness remains a projection from
planning, engineering, supply chain, quality, HSE, resources and predecessor evidence; it is
not a manually editable Project 360 checklist.

## Next bounded implementation gate

Before changing navigation or adding Project 360 groups, inspect the existing surfaces and
classify each capability as **REUSE / EXTEND / COMPOSE / GAP**. The next implementation should
be UI/IA composition only unless the inspection proves a missing canonical capability. It must
include authenticated browser proof and preserve Sales, Project, C4/C5/C6, Documents, Finance,
Approvals and Subcontracts authorities.

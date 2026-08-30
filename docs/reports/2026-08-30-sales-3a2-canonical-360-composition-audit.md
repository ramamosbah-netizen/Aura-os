# Sales & Commercial 3A.2 Canonical 360 Composition Audit

**Date:** 30 August 2026
**Scope:** composition only; reuse existing pages, components, APIs and stores
**Out of scope:** new domain services, physical convergence, Project, redirects and legacy deletion

## Disposition

| Surface | Current implementation | Disposition | Proven gap / boundary |
|---|---|---|---|
| Lead 360 | `app/crm/leads/[id]` + `Lead360Client` with Overview, Qualification, Communication, Documents and embedded Qualify & Convert context; DMS and Activity are read/context surfaces. | **MOVE-COMPOSE** | The conversion context is implemented inside Overview, while readiness actions can address an unrendered `convert` tab. Add a canonical Conversion context entry reusing the existing card/command; do not create a second conversion writer. |
| Opportunity 360 | `app/crm/opportunities/[id]` + `Opportunity360Client` with Overview, Strategy, Commercial, Engagement, Governance and History; route branch distinguishes Direct/Tender and links to Tender/Quotation. | **REUSE + MOVE-COMPOSE** | Scope/BOQ and Estimation are represented through the existing Direct/Tender progression and Commercial panels. Do not invent a common persistence route in 3A.2; expose existing branch context and preserve source ownership. |
| Tender 360 | `app/tendering/tenders/[id]` + `TenderDetail`; BOQ editing/import, pricing, Bid/No-Bid, Clarifications/Addenda and submission/award controls are present in one Tender-owned workbench. | **REUSE** | Preserve Tender as operation owner. Composition may add clearer section framing/links, but no CRM writer or duplicate BOQ/Submission store. |
| Quotation 360 | `app/crm/quotations/[id]` + `Quotation360Client` with Overview, Pricing, Revisions, Terms, Negotiation, Approval, Documents and Activity; print and pricing deep links remain available. | **REUSE** | Canonical commercial execution context is already present. Only presentation/link composition is allowed; approval, issue, negotiation and pricing writers stay at Quotation owner. |

## Target composition decision

The four surfaces are not rebuilt. The target visible journey is composed from existing owners:

```text
Lead 360 → Opportunity 360 (Direct/Tender) → Tender/Scope/BOQ context
         → Estimation adapter/context → Quotation 360 → Commercial Decisions
```

Scope/BOQ and Estimation remain contextual capabilities in 3A.2 because no standalone common route
has been approved. The current Tender pricing route is labeled as an adapter, not as a physical
Shared Estimation domain.

## 3A.2 implementation gate

- [x] Existing four 360 routes/components inventoried.
- [x] Existing ownership and mutation boundaries identified.
- [x] No new store/service/migration required for the composition pass.
- [x] Lead Conversion context no longer targets an unrendered tab; the existing card/command is
      exposed through the canonical `Conversion` tab and remains visible from Overview.
- [x] No additional Opportunity/Tender composition gap proven; existing context links are sufficient
      for the current 3A.2 scope and no new route is warranted.
- [ ] Browser/CI runtime evidence remains a separate release gate.

**Result:** the identified Lead Conversion tab target was fixed using the existing conversion
card/command. Continue with only small composition links/labels where evidence shows a real navigation
gap. Do not build new 360 domains or a Shared Estimation implementation in 3A.2.

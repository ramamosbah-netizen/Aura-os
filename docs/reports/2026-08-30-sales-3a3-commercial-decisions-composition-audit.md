# Sales & Commercial 3A.3 Commercial Decisions Composition Audit

**Date:** 30 August 2026
**Scope:** `/crm/commercial` composition, ownership and read-model boundaries
**Execution target:** `main` / local workspace
**Out of scope:** Project Delivery, Phase 3B, physical convergence, route deletion, legacy mutation removal

## Requirement

`/crm/commercial` must be a Commercial Decisions workspace inside the single Sales cockpit. It may
prioritize work, expose readiness/risk/financial context and link to canonical records, but it must
not become a second owner for quotation, negotiation, document, Tender or Contract mutations.

## Current implementation

`app/crm/commercial/page.tsx` loads quotation, contract, Tender pricing, DMS evidence/checklist and
canonical quotation pricing-summary read models, then composes them through
`components/commercial-workspace.tsx`.

The workspace currently exposes these tabs:

`Overview`, `Decision Queue`, `Quotations`, `Pricing`, `Financials`, `Risks`, `Negotiation`,
`Documents`, `Approvals`, `Margins`.

## Disposition matrix

| Surface | Evidence in current implementation | Disposition | Finding / boundary |
|---|---|---|---|
| Overview | KPI cards aggregate quotation and contract read data; no writer or raw cost calculation. | **MOVE-COMPOSE** | Keep as decision context, but label the page as `Commercial Decisions` so it cannot be mistaken for a second Sales cockpit. The single cockpit remains `/crm/overview`. |
| Decision Queue | Filters `internal_review`, shows readiness flags, linked Opportunity/Contract context and links to `/crm/quotations/:id?focus=approval`. | **REUSE** | Correct prioritization surface. Approval/cancellation remain on Quotation 360. Checklist seeding via `/api/document-requirements/seed` is the documented temporary compatibility exception and remains owned by Document Control. |
| Approval Readiness / Approvals | `Approvals` is another `internal_review` list; it links to Quotation 360 and does not execute approval. The richer readiness panel already lives in Decision Queue and Quotation 360. | **MOVE-COMPOSE** | No distinct mutation or source of truth found. Treat as a compatibility view of the queue; do not add another approval implementation. |
| Financials | Uses quotation totals, contract aggregate values and `commercial-pricing-summary`; profit comes from the canonical pricing summary. | **REUSE** | Read/composition-only and source-truth compliant. Unknown pricing remains unknown; no line-cost reconstruction found. |
| Risks | Derives deterministic flags from quote status/date/line presence and canonical pricing-summary availability. | **REUSE** | Read-only risk aggregation. It does not score or mutate quotations and does not create a competing pricing truth. |
| Pricing | Displays Tender pricing-sheet rows and links to `/tendering/pricing` and `/tendering/tenders/:id/pricing`. | **MOVE-COMPOSE** | Keep as a linked Tender-owned summary. Tender remains pricing/build-up owner; Commercial must not edit pricing here. |
| Margins | Repeats quoted/accepted/contracted value and conversion KPIs; explicitly directs users to the pricing sheet for cost detail. | **MOVE-COMPOSE** | Overlaps Financials without a unique source or action. Keep only as a compatibility presentation until a separately authorized consolidation pass. |
| Quotations | Embeds `QuotationsClient`, which exposes quotation create/status PATCH, revision POST and convert-to-contract POST actions. | **LEGACY-COMPAT / DUPLICATE EXECUTION SURFACE** | Proven duplicate execution surface. Canonical owner remains Quotation 360. Do not remove or move it in this audit; record for a later authorized retirement after browser/CI and compatibility proof. |
| Negotiation | `NegotiationTab` records entries through `POST /api/crm/negotiation`; Quotation 360 exposes the same quotation-scoped log. | **LEGACY-COMPAT / DUPLICATE EXECUTION SURFACE** | Negotiation owner is Quotation. Commercial view is retained temporarily for compatibility and must not gain additional commands. |
| Documents | `DocumentsTab` reads DMS access and can share/revoke through `/api/documents/:id/share` and `/permissions/:id`. | **LEGACY-COMPAT** | DMS owns sharing/revocation. Commercial is only an access/context surface; no quotation document store is created. Retirement requires a separate DMS/UX migration decision. |
| Linked records | Queue and quotation rows link to Opportunity, Quotation 360, Tender pricing and Contract routes. | **REUSE** | Deep links preserve canonical destinations and source lineage. No alternate Commercial record route is introduced. |

## Source-of-truth check

The reviewed Commercial read models use:

- quotation totals for quoted/accepted quotation value;
- Contract records for contracted value;
- `commercial-pricing-summary` for cost/profit/margin visibility;
- DMS/document-requirements APIs for evidence and access;
- quotation-scoped negotiation API for the negotiation log.

No independent margin/cost calculation from quotation line cost fields was found in the reviewed
Commercial components. The only direct mutation exceptions are the pre-existing compatibility
surfaces listed above; none is authorized to become a new owner.

## Safe 3A.3 change

The proven presentation gap is the page identity: the current `CRM · Commercial` heading and
"everything ... in one place" copy can read like a second cockpit. The safe additive correction is
to present it explicitly as **Commercial Decisions — Decision Workspace**, while retaining all
existing tabs, routes, APIs and rollback behavior.

No new service, store, migration, route or writer is required by this audit.

## 3A.3 gate

- [x] Commercial panels/actions inventoried.
- [x] Decision Queue confirmed as prioritization-only except documented checklist compatibility seed.
- [x] Financials/Risks checked against canonical read-model sources.
- [x] Quotation, Negotiation and DMS duplicate execution surfaces recorded as compatibility gaps.
- [x] Deep-link destinations identified.
- [x] No new domain writer/store/migration required.
- [ ] Browser runtime proof remains a separate release gate.
- [ ] CI execution remains a separate release gate.

**Result:** **3A.3 = CLOSED — Commercial Decisions composed and verified.** The route is presented as
the Commercial Decisions read/decision workspace inside the single Sales & Commercial cockpit.
Canonical mutation ownership remains unchanged. Existing Quotation, Negotiation and DMS execution
surfaces are explicitly retained as `LEGACY-COMPAT` pending separately authorized compatibility /
retirement work; they do not block closure of the additive 3A.3 scope.

# Direct Sales Estimation vs Tender Estimation — Full Capability & Data Ownership Audit

**Status:** Read-only current-state audit delivered; Gate 0 Common Scope + Common BOQ Revision approved; remaining Phase 2.5 execution evidence pending; no Shared Estimation implementation authorized
**Date:** 30 August 2026
**Scope:** Direct Opportunity Pre-Award and Tendering estimation/pricing paths, their data ownership,
APIs, UI, permissions, events, quotation generation and tests.
**Decision boundary:** This audit supplies the Phase 2.5 target-alignment gate. It does not rename,
delete, merge or migrate either implementation.

**Phase 2.5 contract companion:** [Common Scope + Common BOQ Revision Contract](2026-08-30-common-scope-common-boq-revision-contract.md)

## Executive finding

The repository contains two route-specific estimation workflows that share calculation primitives but
do not currently have identical aggregates, lifecycles or ownership boundaries:

- **Direct Sales:** Opportunity → Pre-Award Package → Scope/Basis Revision → Estimate Revision →
  Pricing Sheet → Quotation.
- **Tendering:** Tender → BOQ/BOQ Item → Rate Build-Up → Tender Estimate summary → CRM Quotation.

The shared math is already partially centralized in `@aura/shared`, but the current persisted and
commercial semantics are not interchangeable. Direct governed estimation is now cost-first and makes
the selling decision in Pricing; Tender `RateBuildUp` still composes cost, profit and selling rate for
backward-compatible BOQ pricing. Tender also has supplier-quote sourcing and BOQ-specific rollups
that have no direct equivalent.

**Conclusion:** the ADR target of one logical Estimation capability inside a broader
`Signal → Lead → Opportunity/Tender → Scope → BOQ → Estimation → Quotation → Contract` chain is
plausible, but the canonical contract and migration order must be designed from this evidence.
Neither path is a safe drop-in replacement for the other, and neither may simply be renamed to
`Shared Estimation`. Contract-to-Project is a downstream handoff and is not part of the estimation
writer boundary.

## Method and evidence

The audit inspected current source, migrations, routes, domain services, stores, controllers, web
workspaces and tests. Evidence paths are kept explicit so the eventual parity review can be repeated.

Primary evidence:

- Direct domain and lifecycle: `modules/crm/src/domain/pre-award-package.ts`,
  `modules/crm/src/pre-award-package.service.ts`, `modules/crm/src/domain/solution-scope.ts`.
- Direct pricing: `modules/crm/src/domain/pricing-sheet.ts`,
  `modules/crm/src/pricing-sheet.service.ts`.
- Tender domain and lifecycle: `modules/tendering/src/domain/estimate.ts`,
  `modules/tendering/src/estimate.service.ts`, `modules/tendering/src/estimate-sourcing.service.ts`.
- Shared calculation: `shared/src/domain/estimation-core.ts`, `shared/src/domain/estimation.ts`.
- Direct migrations: `0166_crm_pre_award_discovery.sql`, `0191_crm_pricing_sheets.sql`,
  `0244_pre_award_package_expand.sql`, `0248_crm_pricing_commercial_decision.sql`,
  `0249_crm_pricing_sheet_effectivity.sql`.
- Tender migrations: `0042_tendering_boq.sql`, `0121_tender_rate_buildups.sql`,
  `0167_tender_estimate_sourcing.sql`, `0179_tender_estimate_risk.sql`, `0180_tender_register_depth.sql`.
- APIs: `apps/api/src/crm/pre-award-package.controller.ts`,
  `apps/api/src/crm/pre-award.controller.ts`, `apps/api/src/crm/pricing-sheets.controller.ts`,
  `apps/api/src/tendering/estimates.controller.ts`, `apps/api/src/tendering/pricing.controller.ts`,
  `apps/api/src/estimation/estimation.controller.ts`.
- Web: `apps/web/components/estimation-workspace.tsx`,
  `apps/web/components/pricing-workspace.tsx`, `apps/web/components/tender-pricing-client.tsx`.
- Tests: CRM estimation/pricing/pre-award suites, Tender estimate/sourcing/governance suites and
  API pricing/pre-award end-to-end suites.

## Current journey and ownership

```text
DIRECT
Opportunity
  └─ Pre-Award Package (CRM)
       └─ Scope/Basis Revision (CRM)
            └─ Estimate Revision + build-ups (CRM)
                 └─ Pricing Sheet / commercial decision (CRM)
                      └─ CRM Quotation

TENDER
Tender (Tendering)
  └─ BOQ + BOQ Items (Tendering)
       └─ Rate Build-Up per BOQ item (Tendering)
            └─ Tender Estimate summary (Tendering)
                 └─ CRM Quotation generated from priced BOQ
```

This is current-state ownership. The target ADR may expose one Commercial Definition Chain and one
logical Estimation capability across both source branches, while Tender remains the owner of Tender source/governance, sourcing, submission
and award facts. Tender BOQ is the strongest current implementation, but the target treats BOQ as a
common downstream Commercial Scope capability with source-specific adapters. CRM Quotation remains
the owner of customer-facing price and quotation lifecycle.

## North Star — one Commercial Delivery Definition Chain

The audit feeds a broader Signal-to-Contract target. It is intentionally a logical chain, not a
permission to collapse the current bounded domains or physical stores:

```text
Signal → Lead → Opportunity
                    ├─ DIRECT ───────────────┐
                    └─ TENDER → Tender 360 ──┤
                         bid/no-bid · requirements
                         clarifications · addenda
                                             ▼
                                           Scope
                                             ▼
                                        BOQ revision
                                             ▼
                                      Estimate revision
                                             ▼
                                 Recommended price
                                             ▼
                                      Quotation revision
                                             ▼
                              Approval → Issue / Submit → IMMUTABLE
                                             ▼
                                  Acceptance / Award Evidence
                                             ▼
                                          Contract
                                             ▼
                                      Project handover
```

Scope defines what is offered; BOQ defines measurable priceable items. Direct and Tender may supply
different source evidence, but both must preserve source type, source ID and source revision when
they enter the logical BOQ/Estimation contract. Direct Quotation Issue and Tender Submission are
separate events; only their accepted/awarded results converge at Contract.

## Best-of-Breed capability matrix

This matrix selects the strongest current capability for the target contract without declaring a
physical merge. “Proof/gate” identifies the evidence still required before a migration decision.

| Stage / capability | Strongest current implementation | Current owner | Target logical owner | Disposition | Proof / gate |
|---|---|---|---|---|---|
| Signal / Radar | CRM Signals/Radar and CRM signal controller | CRM | CRM | KEEP | Phase 0 route, tenant and read-composition evidence |
| Lead capture, qualify, convert | CRM Lead/Lead 360 plus shared capture and conversion services | CRM | CRM | KEEP | Phase 2 HTTP/browser workflow parity from Pipeline and Lead 360 |
| Opportunity / pursuit / forecast | CRM Opportunity 360, qualification and forecast | CRM | CRM | KEEP | Existing Phase 0–2 evidence closure |
| Tender qualification / bid-no-bid | Tender 360 qualification workflow | Tendering | Tendering | KEEP | Tender permission, tenant and audit matrix |
| Tender scope, BOQ, clarifications, submission, award | Tender BOQ/BOQItem hierarchy, Tender 360 and submission/outcome flows | Tendering | Tendering for source/governance; Common Commercial Scope/BOQ contract downstream | KEEP + ADAPT | Preserve bounded commands; use Tender BOQ as the strongest starting adapter; separate Submission/Award events |
| Direct scope / requirements | SolutionScope plus governed Basis Revision | CRM | Scope contract with CRM Direct adapter | ADAPT | Reconcile legacy SolutionScope pricing and governed package path |
| Common Scope / BOQ contract | Logical priceable-scope projection | Not yet singular | Commercial Scope/BOQ capability | CONVERGE | Approve fields, revisions and provenance; start from Tender BOQ capability without making it Tender-only; no new BOQ implementation yet |
| Estimate revisions / cost build-up | Pre-Award Package, Basis/EstimateRevision and build-up chain | CRM Direct | Estimation logical contract | KEEP + ADAPT | Define source revision, lifecycle and immutable snapshots |
| Tender rate build-up | RateBuildUp and Tender EstimateService | Tendering | Estimation Tender adapter | ADAPT | Preserve BOQ semantics; separate cost from recommendation |
| Supplier sourcing | EstimateSourcingService, RFQ quote links, stale/restamp/unsource | Tendering | Estimation sourcing extension | KEEP behind contract | Prove source effectivity, tenant isolation and revision linkage |
| Recommended price | Direct PricingSheet / CommercialDecision and shared pricing primitives | CRM | Estimation → Commercial Recommendation | KEEP + CONVERGE | Align margin/markup, rounding and policy semantics |
| Customer price, terms, negotiation, approval, issue | CRM Quotation 360 and quotation service | CRM | Quotation | KEEP | Quotation revision, approval-lock and external-issue immutability proof |
| Tender submission package | Tender submission, addenda, technical/commercial evidence | Tendering | Tendering | KEEP | Do not conflate with Quotation Issue; prove audit lineage |
| Direct acceptance / Tender award | CRM accepted quotation / Tender Award Evidence | CRM / Tendering | Contract handoff | CONVERGE at handoff | Accepted/awarded value must come from frozen evidence, not latest draft |
| Contract baseline | Contracts Contract aggregate and baseline references | Contracts | Contracts | KEEP | Full source lineage and signed/awarded contract proof |
| Project handover | Contracts-to-Projects handoff | Contracts / Projects | Delivery downstream | KEEP | Project only after valid Contract; immutable baseline handoff |
| Commercial Reports | Existing CRM/Tender summaries and analytics views | Read models | Commercial Reports facade | ADAPT | Provenance, bounded reads and no competing recalculation |

## Capability parity matrix

| Area | Direct current implementation | Tender current implementation | Shared vocabulary / evidence | Delta, risk and target contract implication |
|---|---|---|---|---|
| Scope model | `SolutionScope` plus frozen `EstimationBasisRevision`; basis source kind `scope` | `BOQ` + `BOQItem`; hierarchical item code, IFC GUID and tender ownership | Both project source lines into priced lines; `0244` supports `source_kind = scope \| boq` | Same logical `BasisRevision` can represent both, but source ownership and line hierarchy must remain explicit. |
| Estimate identity | `PreAwardPackage` (XOR opportunity/tender), `EstimateRevision` with `revisionNo`, basis link and status | `RateBuildUp` is one row per BOQ item; tender summary is calculated, not a revision aggregate | Both have tenant/company IDs and per-line build-up data | Tender has no equivalent first-class estimate-revision chain. Canonical contract must add revision identity without erasing BOQ semantics. |
| Revision model | Basis and estimate revisions; draft → frozen/approved → superseded | Rebuild replaces the build-up for a BOQ item; no comparable revision entity in the inspected path | Shared need for immutable snapshots | Do not infer Tender replacement equals Direct revision. Add an explicit revision/provenance adapter before migration. |
| Resource build-up | Shared `ResourceBreakdown` compiles to typed components; cost-only estimate | Same resource compiler can populate Tender components; raw component entry also supported | `compileResourceBreakdown`, `CostType`, component IDs | Math input can converge, but persistence and source references differ. |
| Cost math | `computeCostBuildUp` for governed Direct estimate; estimated cost stops before selling decision | `computeBuildUp` composes cost + markup-style profit into selling rate for BOQ compatibility | Both consume shared `estimation-core.ts` | Tender still carries a commercial selling number in the estimate aggregate. Target contract must separate cost outputs from commercial decision while preserving a compatibility adapter. |
| Commercial pricing | `PricingSheet` / `CommercialDecision`; target margin or markup, discount, frozen totals | `profitPercent` and `sellingRate` are part of `RateBuildUp`; no equivalent PricingSheet decision object | `computeCommercialPricing` exists in shared core | High semantic risk: markup vs target-margin conventions and discount handling are not identical. One canonical policy contract is required. |
| Margin | Direct pricing computes realised margin from frozen pricing decision/baseline | Tender summary reports blended `(overhead + profit) / selling` over estimated items | Both expose margin percentages | Same label does not prove same denominator or lifecycle. Target must name `cost`, `recommendedPrice`, `customerPrice`, and margin basis. |
| Indirect/overhead/risk | Estimate build-up stores indirect, delivery overhead and risk; profit is accepted but ignored in cost-only path | Rate build-up stores indirect, overhead, risk and profit; risk added by migration `0179` | Shared loading vocabulary | Target must distinguish cost allowances from commercial uplift and avoid double-loading. |
| Supplier sourcing | No equivalent supplier RFQ component source in Direct path | `EstimateSource` links component to RFQ/quote, restamps on award, detects stale source and reverts on unsource | Both use component IDs and tenant scope | Tender sourcing is unique capability. It must remain available in the canonical contract or as a Tender adapter. |
| Approval/freeze | Basis approval, estimate freeze/approval, pricing freeze; unknown quantity blocks progression | Tender pricing edits are blocked once generated quotation is committed; no matching estimate approval chain in inspected estimate domain | Both have freeze-on-commit intent | Lifecycle states are not equivalent. A parity design must define estimate approval separately from quotation approval. |
| Snapshot/effectivity | Estimate revisions and PricingSheet version/parent chain; frozen sheets can be superseded without rewriting history | Rate build-up replacement is current-row oriented; quotation commitment locks further pricing via controller policy | Both need immutable customer-facing evidence | Tender needs explicit estimate snapshot/effectivity mapping before it can share Direct revision semantics. |
| Quotation generation | Governed chain requires approved scope + estimate + frozen pricing; pricing sheet generates lines; older `PreAwardService` also generates from approved `SolutionScope` | `POST /tendering/tenders/:id/quotation` maps BOQ items to quote lines, using selling rate or BOQ rate fallback | Both create CRM quotation drafts | Direct has two current entry paths; Tender has unpriced-line fallback. Target lineage must identify exact source revision and reject/flag fallback semantics where governance requires priced evidence. |
| Source lineage | Package, basis revision, estimate revision, pricing sheet and quotation links | Tender, BOQ, build-up, source links and `sourceTenderId` on quotation | Both carry tenant and source IDs | Canonical contract must preserve `sourceType`, source ID, source revision/hash and generated quotation lineage. |
| Currency/tax | Pricing/quotation path carries quotation VAT/tax fields; estimate core is numeric and currency-agnostic | Tender quotation generation accepts optional VAT rate; BOQ/rate tables are numeric | Both defer customer tax to quotation generation | Currency and rounding policy must be explicit in the shared contract; numeric parity alone is insufficient. |
| Reports/exports | Pricing sheet totals and quotation-facing pricing reads; Direct estimate workspace is record-scoped | Tender pricing sheets, tender summary and CSV exports include priced/unpriced BOQ value and margin | Both expose cost/sell/margin summaries | Reports must compose canonical projections and preserve Tender-specific unpriced BOQ semantics without recalculation drift. |
| Permissions | Direct controllers use tenant context; quotation commands have explicit CRM permissions; pre-award endpoint taxonomy remains part of baseline work | Tender controllers rely primarily on route-derived permission taxonomy plus tenant checks in services/controllers | Both are tenant-scoped | HTTP permission evidence is still required. Shared capability cannot weaken either boundary; action permissions must be named per source and lifecycle. |
| Tenant/RLS | CRM package/basis/estimate/build-up and pricing tables use forced tenant RLS or tenant-scoped stores | BOQ, rate build-up and source tables are tenant-scoped; some older BOQ policies are not forced in the inspected migration | Both include tenant IDs | RLS posture is not identical. Isolated DB proof must confirm no cross-tenant joins or source links leak data. |
| Events/audit | CRM pricing/quotation and lifecycle events; baseline and approval audit behavior | `tendering.estimate.rate_built`, quotation generated, component sourced/restamped/cleared | Both emit lifecycle events | Event names/payloads are not interchangeable. Canonical events must preserve source-specific provenance and audit actor. |
| Tests | Estimation workspace, package lifecycle, pricing effectivity, quotation generation and Postgres integration tests | Estimate domain, sourcing, tender commercial basis, pricing governance and API E2E tests | Strong local unit/service coverage | Missing proof is cross-path HTTP/browser/DB parity, not another local engine rewrite. |

## Entity and table inventory

### Direct Sales / CRM

| Concern | Current entity/table | Role | Ownership finding |
|---|---|---|---|
| Customer requirement | `Requirement` / `aura_crm_requirements` (`0166`) | Discovery input | CRM Opportunity owns the requirement; Estimation consumes a projected basis. |
| Direct scope | `SolutionScope` / `aura_crm_solution_scopes` (`0166`) | Priceable scope lines and legacy quote-generation source | Current scope lines contain `unitPrice` and `lineTotal`; this is a potential commercial overlap that must be classified during migration. |
| Package | `PreAwardPackage` / `aura_crm_pre_award_packages` (`0244`) | Aggregate with direct/tender XOR owner | Current package model already anticipates a shared logical chain, but its physical ownership is CRM. |
| Basis revision | `EstimationBasisRevision` / `aura_crm_estimation_basis_revisions` (`0244`) | Frozen scope/BOQ projection with provenance | Strong candidate for canonical basis contract. |
| Estimate revision | `EstimateRevision` / `aura_crm_estimate_revisions` (`0244`) | Revision lifecycle and totals | Strongest current revision model in the inspected code. |
| Estimate build-up | `EstimateBuildUp` / `aura_crm_estimate_build_ups` (`0244`) | Per-basis-line resources/components and cost outputs | Cost-only path; `sellingRate` remains as a compatibility carrier and must not be treated as target ownership. |
| Pricing sheet | `PricingSheet` / `aura_crm_pricing_sheets` (`0191`, `0248`, `0249`) | Commercial pricing decision, versioning, freeze/effectivity and quote output | Canonical CRM commercial pricing owner for Direct. |
| Quotation links | `package_id`, `pricing_sheet_id`, `estimate_revision_id` links (`0244`, `0268`) | Traceability to source price | Preserve as lineage snapshots when a shared contract is introduced. |

### Tendering

| Concern | Current entity/table | Role | Ownership finding |
|---|---|---|---|
| Tender | `Tender` / `aura_tendering_tenders` | Bid lifecycle, source, deadline and award | Tendering remains bounded-domain owner. |
| BOQ | `BOQ` / `aura_tendering_boqs` (`0042`) | One BOQ per tender | Tendering currently owns the strongest scope structure and quantities; target ownership is the common Commercial Scope/BOQ contract. |
| BOQ item | `BOQItem` / `aura_tendering_boq_items` (`0042`) | Item code, unit, quantity, rate, total and IFC link | Source basis; not an Estimation-owned customer price. |
| Rate build-up | `RateBuildUp` / `aura_tendering_rate_buildups` (`0121`, `0179`) | One current build-up per BOQ item with selling rate | Tender-specific current implementation; no explicit revision/effectivity aggregate. |
| Estimate source | `EstimateSource` / `aura_tendering_estimate_sources` (`0167`) | RFQ quote provenance, stale detection and restamp | Unique Tender sourcing capability; retain through adapter or canonical extension. |
| Tender summary | `TenderEstimate` (computed) | Folded cost/sell/unpriced value/margin | Read model, not a persisted estimate revision. |
| CRM quotation link | `sourceTenderId` and quotation-generated event | Customer quote output | Quotation remains CRM-owned; Tender supplies source snapshot. |

## API and UI matrix

| Path | Current surface | Current writes/reads | Canonical ownership implication |
|---|---|---|---|
| `/crm/opportunities/:id/pre-award-package/*` | Direct governed Pre-Award package | Scope/basis, estimate build-ups, freeze/approve, pricing policy/freeze/revision | Direct adapter to logical Estimation plus CRM Pricing; do not remove until parity. |
| `/crm/opportunities/:id/requirements`, `/scope`, `/generate-quotation` | Older Direct discovery path | Requirements, SolutionScope approval and direct quote generation | Duplicate Direct execution surface; must be reconciled with package chain before consolidation. |
| `/crm/pricing-sheets/*` | Direct/general Pricing Workspace API | Draft lines, freeze, revise, compare, generate quotation | CRM commercial pricing owner; not a substitute for source estimation. |
| `/estimation/line` | Stateless shared calculation endpoint | `estimateLine` preview/result | Calculation utility only; not a persisted ownership boundary and currently lacks explicit decorator proof. |
| `/tendering/estimates` | Tender rate build-up API | Build/list/summary/BOQ item | Tender adapter; must expose revision/provenance if mapped into shared contract. |
| `/tendering/tenders/:id/pricing/*` | Tender pricing sheet API | BOQ item price, sourcing, CSV, lock state, quote generation | Tender workbench remains source-domain writer until target migration is proven. |
| `/crm/opportunities/[id]/pre-award/estimate/[estimateId]` | Direct estimation workspace | Cost resources/loadings, freeze/approve | Cost-side Estimation candidate. |
| `/crm/opportunities/[id]/pre-award/pricing/[sheetId]` | Direct pricing workspace | Commercial policy/discount, freeze/revise/quote | Quotation-side commercial decision candidate. |
| `/tendering/tenders/[id]/pricing` | Tender pricing workspace | BOQ resource editor, preview, source/unsource, lock, quote | Tender-specific UI; target may be an Estimation adapter, not a copied editor. |

## Current permission, tenant and event observations

- Direct quotation mutations have explicit CRM permission decorators and the current remediation adds
  readiness, SoD and baseline tests.
- Direct pre-award and Tender estimate controllers do not all declare method-level `@Permissions`
  decorators; route-derived taxonomy and service tenant checks are part of the effective boundary.
- Direct package/basis/estimate/build-up tables use forced RLS in migration `0244`; pricing sheets use
  tenant RLS in `0191` and later additions.
- Tender rate build-ups and sourcing links are tenant-scoped; BOQ migration `0042` has tenant policies
  but the inspected policy is not the same forced-RLS posture as later CRM tables.
- Direct lifecycle and quotation events and Tender estimate/source events are separate contracts. A
  shared logical capability must not collapse them into a generic event that loses source provenance.

## Gaps and risks requiring Phase 2.5 decisions

1. **Two Direct paths:** legacy `PreAwardService` can generate from `SolutionScope`, while governed
   `PreAwardPackageService` requires Basis → Estimate → Pricing. This is a Direct consolidation gap,
   independent of Tender parity.
2. **Cost/commercial semantic split:** Direct governed estimate is cost-only; Tender `RateBuildUp`
   still stores profit and selling rate. A target contract must separate `estimatedCost` from
   `recommendedPrice` and `customerPrice`, while preserving Tender compatibility.
3. **Revision asymmetry:** Direct has explicit basis/estimate/pricing revisions and effectivity;
   Tender replaces one build-up per BOQ item. No migration may claim revision parity until Tender
   snapshots and lineage are defined.
4. **Scope-price overlap:** Direct `SolutionScope` stores `unitPrice`/`lineTotal`, which can compete
   with PricingSheet as a source of customer price. Classify it as legacy projection or migrate its
   write authority before retiring the old path.
5. **Tender-only sourcing:** RFQ quote sourcing, stale detection, restamp and un-source are unique
   Tender capabilities. They must be preserved in the logical contract or a bounded Tender adapter.
6. **Quotation fallback:** Tender can use an existing BOQ rate for an unpriced item. The target must
   decide whether this is an allowed compatibility path, a warning, or a governance failure.
7. **Approval mismatch:** Direct has estimate and pricing approvals; Tender commitment is enforced
   mainly when a generated quotation becomes committed. The target needs explicit estimate-versus-
   quotation approval semantics.
8. **Permission/RLS mismatch:** route-derived permissions and different RLS policies require isolated
   database and HTTP proof before a shared writer is considered.
9. **Calculation vocabulary:** `estimateLine` and `computeBuildUp` have different inputs, rounding,
   loadings and pricing conventions. Shared function names do not prove numerical or semantic parity.
10. **Reporting ambiguity:** Tender unpriced BOQ value and Direct unknown quantity are distinct states;
    a shared report must not turn either into zero or silently mix them.

## Disposition matrix — reviewed

This matrix has been reviewed row-by-row against the current implementation evidence. The decisions
accept the logical target and preserve current stores; they are not an implementation authorization.

### Row-by-row review record

| # | Capability / gap | Reviewed decision | Review conclusion and condition |
|---:|---|---|---|
| 1 | Direct governed Package → Basis → Estimate → Pricing | **ACCEPT — KEEP** | Use as the strongest Direct adapter boundary; retain legacy path until parity and migration evidence pass. |
| 2 | Direct legacy `SolutionScope` → Quotation | **ACCEPT — ADAPT, then DEPRECATE** | Keep compatibility and historical reads; define marker/read-only fallback and prove no governed quote bypass. |
| 3 | Tender BOQ and hierarchical scope | **ACCEPT — KEEP + ADAPT** | Preserve Tendering source/governance and use its hierarchy, item codes, quantities and IFC capability as the starting adapter for common Commercial Scope/BOQ. |
| 4 | Tender `RateBuildUp` current row | **ACCEPT — ADAPT** | Expose canonical revision/provenance through an adapter; do not rename or move the table yet. |
| 5 | Tender RFQ component sourcing | **ACCEPT — KEEP behind contract** | Preserve stale detection, restamp and unsource; define source-link and freeze semantics for revisions. |
| 6 | Shared cost primitives | **ACCEPT — CONVERGE at contract level** | Reconcile rounding, loadings and unknown/unpriced behavior before any formula or store change. |
| 7 | Shared `estimateLine` preview | **ACCEPT — ADAPT** | Keep as a calculation/preview utility until the canonical pricing-policy boundary is approved. |
| 8 | Tender embedded profit/selling rate | **ACCEPT — ADAPT** | Preserve historical projection but separate estimate cost, recommendation and customer price in the target. |
| 9 | Direct PricingSheet commercial decision | **ACCEPT — KEEP** | Remains Quotation-facing commercial pricing owner; recommended price is not customer price. |
| 10 | Tender estimate revision/effectivity | **CONDITIONAL — CONVERGE after design** | No current parity claim; choose adapter snapshots or a new revision store in the separate Phase 3B gate. |
| 11 | Estimate → Quotation lineage | **ACCEPT — CONVERGE** | Mandatory source type, source revision and exact pricing snapshot for both branches. |
| 12 | Reports and summary rollups | **ACCEPT — ADAPT** | Read/composition only, with provenance; no competing recalculation or report database. |
| 13 | Physical store/service merge | **ACCEPT — MIGRATE LATER** | Explicitly deferred. Physical convergence is not implied by the logical target and requires Phase 3B approval. |

### Gate 0 decision

**Gate 0 APPROVED for the logical Common Scope + Common BOQ Revision contracts.** The architecture
direction of one Commercial Definition Chain (`Scope → BOQ → Estimation → Quotation → Contract →
Project handover`) with Direct and Tender source semantics is accepted for Phase 2.5 design and proof.
The physical topology remains undecided; the approved interim shape is compatible adapters over
existing stores until Phase 3B evidence proves that a physical convergence is required and lossless.

This decision does not authorize Shared Estimation implementation, route migration, table changes,
legacy-surface removal or destructive consolidation. Final ADR acceptance remains conditional on the
Phase 2.5 exit criteria and owner sign-off.

## Quotation Revision Lifecycle — current proof boundary

The current CRM quotation domain already separates approval governance from the customer-facing
revision boundary, but the complete Phase 2.5 proof is not yet closed:

| Boundary | Current implementation evidence | Phase 2.5 interpretation |
|---|---|---|
| Approval/readiness | `applyQuotationAction` permits `draft` or `internal_review` → `approved`; the service enforces readiness, segregation of duties, authority and locks the Commercial Baseline. | Approval is a governance/readiness and field-lock boundary. It is not itself the external issue event. |
| External issue | `approved` → `sent`; the Quotation 360 UI exposes Send only from `approved`. | `sent` is the customer-facing issue boundary for this domain and must be treated as immutable evidence. |
| Post-issue changes | Commercial terms and pricing are refused after approval/sent; `reviseQuotation` creates a new draft with `revision + 1`, parent link and copied snapshots. | Any change to an issued revision must produce a new revision; the old revision and its baseline remain unchanged. |
| Negotiation | `sent` → `under_negotiation`; revise is a separate command that supersedes the old record. | Negotiation is not permission to edit an issued record in place. |
| Acceptance/contract | `accepted` links to a Contract; Tender pricing is also locked once a committed quotation exists. | Accepted value must flow to Contract from the accepted/frozen basis, not from a mutable latest quote. |

Required proof remains HTTP/DB/CI and browser evidence for the full state sequence. In particular,
tests must assert separately that approval locks governed fields/baseline and that external issue
locks the entire customer-facing revision. The two assertions must not be collapsed into one generic
“approved means immutable” test.

## Proposed target logical contract — design input, not implementation

The following is a candidate contract for Phase 2.5 review. It is intentionally logical and does not
select a physical package, service or table:

```text
Estimate
├── sourceType: DIRECT | TENDER
├── sourceId: Opportunity or Tender id
├── sourceRevisionRef: scope/basis revision, BOQ revision or immutable hash
├── basisRevision
│   ├── scope: what is being offered (not customer price)
│   ├── boqRevision: measurable priceable items and hierarchy
│   ├── lines: sourceLineId, description, unit, quantity (unknown is not zero)
│   └── provenance: source owner and source revision
├── estimateRevision
│   ├── resource build-up by line
│   ├── direct / indirect / overhead / risk cost
│   ├── estimatedCost
│   └── estimate status and snapshot timestamps
├── commercialRecommendation (optional until Pricing decision)
│   ├── policy: target margin or markup
│   ├── recommended price
│   └── recommendation revision
└── provenance
    ├── tenant/company
    ├── actor/audit events
    ├── source-specific references (BOQ, RFQ, SolutionScope)
    └── quotation lineage when generated
```

This contract must not make `recommendedPrice` equal to `customerPrice`: Quotation owns discount,
terms, validity, negotiation, approval, issue and the frozen Commercial Baseline.

An estimate revision referenced by a quotation is a snapshot/reference to that exact revision. A
later recalculation creates a new estimate revision; it never rewrites the revision already used by
an issued quotation. Approval may lock governed fields, but **external issue** is the final immutable
boundary for the customer-facing quotation revision.

## Phase 2.5 gate checklist

Phase 2.5 is not implementation. It is the target-alignment gate before destructive consolidation.
Gate 0 is approved for Common Scope + Common BOQ Revision. The checklist below records the remaining
execution and owner-sign-off conditions rather than reopening that decision.

- [ ] Single Cockpit composition is accepted; `/crm/overview` is the only cockpit and Tender remains a
      bounded operational workbench.
- [ ] Sales/Pre-Award IA maps Direct and Tender entry points to one visible Estimation capability
      without moving commands prematurely.
- [x] This capability/data ownership audit is reviewed and all gaps are dispositioned.
- [x] Direct and Tender capability parity matrix is approved, including explicit Tender-only deltas.
- [x] Best-of-Breed target matrix is approved: Tender owns source/governance, while BOQ is a common
      downstream Commercial Scope capability based on the strongest available implementation.
- [x] The Commercial Definition Chain is accepted as `Scope → BOQ revision → Estimate revision →
      Quotation revision → Contract → Project handover`; Project creation remains downstream of
      Contract.
- [ ] Contract → Project Handover is accepted with complete lineage, immutable delivery-baseline
      semantics and PD-4 boundary evidence.
- [x] Canonical logical Estimation contract is approved without selecting a physical store prematurely.
- [ ] Quotation Revision Lifecycle Proof passes: `DRAFT → APPROVED → ISSUED/SUBMITTED → IMMUTABLE`,
      and any change after issue creates a new draft revision.
- [ ] Estimate → Quotation lineage is proven for both Direct and Tender source branches.
- [x] Tender/Direct source semantics, revision references and fallback behavior are explicit.
- [ ] Commercial Reports is confirmed read/composition-only and does not recalculate business truth.

## Required proof before Commercial Definition Chain convergence

The next implementation work must remain read-only or test-only until these proofs exist. No Common
Scope/BOQ, Shared Estimation, Quotation or Contract handoff migration is authorized by this audit:

1. Compare every capability in the parity matrix with fixture-level numerical and semantic
   reconciliation, including rounding, margin denominator, unknown quantity and unpriced BOQ value.
2. Prove Direct and Tender HTTP permission, tenant isolation, audit and error behavior for create,
   edit, freeze, approve, source/unsource and quote generation.
3. Add browser parity evidence for both entry points, including deep links and locked/frozen states.
4. Prove issued Quotation revisions are immutable and a change request creates a new revision without
   mutating the issued revision or its Commercial Baseline.
5. Prove quotation lineage retains source type, source ID, source revision and the exact estimate /
   pricing snapshot used to create the draft quote.
6. Run the complete matrix in CI against a disposable PostgreSQL database after all migrations.

## Local verification checkpoint

The current local suites provide useful domain evidence, but they do not close the cross-boundary
gate:

| Suite | Result | What it proves | What it does not prove |
|---|---|---|---|
| CRM | 427 passed, 37 skipped | Direct package, pricing, quotation, lead and ownership behavior in memory/unit/service tests | Disposable PostgreSQL migration, live HTTP authorization or browser parity |
| Tendering | 103 passed, 12 skipped | BOQ, estimate, sourcing, governance and award behavior in memory/unit/service tests | PostgreSQL RLS/migration behavior or HTTP/browser parity |
| Quotation lifecycle targeted run (`modules/crm/src/quotation.service.test.ts`, pricing quotation tests) | 26 passed | Approval/readiness, baseline lock, issue boundary and post-issue revision behavior in local services | End-to-end transport and database evidence |

Skipped integration tests and unavailable disposable PostgreSQL remain explicit blockers for Phase 0–2
closure and the Phase 2.5 convergence decision.

## Recommendation

Keep both current implementations and their stores while Phase 0–2 evidence closes. Treat the
logical Estimation contract as a Phase 2.5 architecture decision, not as permission to write a new
service now. Build adapters and migration fixtures only after parity and ownership are approved.

**Phase 3 remains NO-GO.** No Tender or Direct estimate surface, store, API, Commercial tab or
Pipeline action should be removed because of this audit alone.

# Proposed ADR: Sales & Commercial Signal-to-Contract Suite with Tendering as an Internal Capability

**Status:** Target architecture direction approved; current Sales remediation continues under its separate P0–P2 evidence plan
**Revision:** 4
**Architecture Direction:** APPROVED
**Gate 0:** APPROVED — COMMON SCOPE + COMMON BOQ REVISION LOGICAL CONTRACTS; PHYSICAL OWNER DEFERRED
**Final ADR Acceptance:** PENDING PHASE 2.5 EXECUTION EVIDENCE AND OWNER SIGN-OFF
**Implementation Authorization:** Target-alignment implementation not authorized; current P0–P2 stabilization slices may continue
**Route Changes:** NOT AUTHORIZED
**Persistence Migration:** NOT AUTHORIZED
**Domain Writer Changes:** NOT AUTHORIZED
**Phase 3 / Destructive Consolidation:** NOT AUTHORIZED
**Date:** 30 August 2026
**Decision scope:** User-facing information architecture, route ownership, field ownership, duplicate-page analysis and migration boundaries.
**Out of scope:** Immediate code refactor, database migration or deletion of Tendering APIs.

## Decision summary

Merge **Pre-Award into the visible Sales / Commercial product surface**, but do not merge the
Tendering bounded domain into CRM tables or copy its business logic into Sales UI. The target is one
Commercial Definition Chain with exactly one cockpit, one logical Estimation capability (subject to
the pre-implementation gap analysis), one Quotation lifecycle and one Reports facade:

```text
                         SALES / COMMERCIAL
                                  │
             ┌────────────────────┴────────────────────┐
             │                                         │
        DIRECT SALE                                  TENDER
             │                                         │
        Opportunity                                Tender 360
                                                   Qualification
                                                   BOQ / Scope
                                                   Clarifications
                                                   Submission
             └────────────────────┬────────────────────┘
                                  ▼
                         SCOPE → BOQ REVISION
                                  ▼
                         ESTIMATE REVISION*
                                  │
                    Resource build-up · cost build-up
                    overhead · risk · profit · recommended price
                                  ▼
                              QUOTATION
                                  │
                    Quotation revision · approval · Direct issue
                    Tender submission remains a separate event
                                  │
                                🔒 LOCK
                                  │
                       change requested → new revision
                                  │
                         Tender Award Evidence → Contract
                         Direct Customer Acceptance → Contract
```

\* “One Estimation” is a target logical contract, not a pre-approved physical store, service or
database merge. The physical boundary is decided only after the Estimation Gap Analysis gate.

The visible product surface is:

```text
Sales / Commercial
├── Overview                 ← ONE cockpit (`/crm/overview`)
├── Leads
├── Opportunities
├── Tenders                  ← operational Tender workbench
├── Estimation               ← one logical capability (gap-analysis gated)
├── Quotations               ← customer-facing commercial truth
├── Contracts
└── Reports                  ← one read/projection facade
```

`/suites/pre-award` and `/tendering` are compatibility concerns only. Deep Tendering routes remain
operational, but their shell context becomes `Sales / Commercial → Tenders`; no second cockpit is
recreated under a new name.

## North Star — Signal-to-Contract Commercial Delivery Definition Chain

The target is an end-to-end Sales & Commercial suite, not only a navigation merge. The visible
journey is one chain with a bounded Direct/Tender branch:

```text
Signal → Lead → Opportunity
                    │
             ┌──────┴──────┐
             │             │
          DIRECT        TENDER
             │             ▼
             │          Tender
             │       qualification / bid-no-bid /
             │       requirements / clarifications /
             │       addenda
             └──────┬──────┘
                    ▼
                 Scope
                    ▼
              BOQ revision
                    ▼
            Estimate revision
          cost build-up + sourcing
                    ▼
       Commercial recommendation
                    ▼
           Quotation revision
                    ▼
        Approval → Issue / Submit
                    ▼
                 IMMUTABLE
                    │
          ┌─────────┴─────────┐
          │                   │
   Direct acceptance    Tender award evidence
          │                   │
          └─────────┬─────────┘
                    ▼
                 Contract
                    ▼
             Project handover
```

`Scope` answers what is to be delivered; `BOQ` turns that scope into measurable, priceable items.
They are related but not interchangeable. A Direct opportunity and a Tender may enter the chain
through different source evidence, while both can reference the same logical BOQ/Estimation
contracts. “One Estimation” remains a logical capability; it does not pre-select one physical
database or service.

Quotation Issue and Tender Submission are separate domain events. Direct issue is the customer-facing
quotation boundary; Tender submission carries portal/reference, addenda acknowledgement, technical
and commercial package, documents and submission evidence. They converge only at acceptance/award and
the Contract handoff. Project is downstream of a valid Contract, never the source of the commercial
scope.

Sales & Commercial therefore ends at Contract signed / governed handover. Delivery owns the Project
record and receives the accepted scope, BOQ, estimate, quotation and commercial baseline as an
immutable handoff.

### Target ownership envelope

The suite is one navigation envelope, not one undifferentiated domain:

```text
SALES & COMMERCIAL
├── CRM: Signals, Leads, Opportunities, customer context, qualification and forecast
├── Tendering: Tender, bid/no-bid, clarifications, addenda, submission and award
├── Commercial Scope / BOQ: common priceable-scope capability; Tender BOQ is the strongest starting implementation
├── Estimation: estimate revisions, build-up, sourcing integration, cost and recommendation
├── Quotation: customer price, revisions, terms, negotiation, approval and issue
├── Contracts: accepted commercial agreement and baseline lineage
└── Reports: read/composition facade only
```

The companion Direct-vs-Tender audit records the Best-of-Breed capability selection row by row. It
is the target selection record for Phase 2.5; selecting a capability does not authorize moving its
writer, store or route.

### Best-of-Breed target capability matrix

This is the official target index. The “source” column identifies the strongest current
implementation, not necessarily the final physical owner.

| Stage | Strongest current source | Target capability / logical owner |
|---|---|---|
| Signal / Radar | CRM | Sales Signal — CRM |
| Lead | CRM | Lead — CRM |
| Qualification | CRM | Lead / Opportunity Qualification — CRM |
| Opportunity | CRM | Opportunity — CRM |
| Tender | Tendering | Tender — Tendering |
| Bid / No-Bid | Tendering | Tender Qualification — Tendering |
| Scope | CRM Direct scope + Tender requirements | Commercial Scope — common contract with source adapters |
| BOQ | Tendering BOQ/BOQItem hierarchy | Common BOQ — strongest Tender starting adapter |
| BOQ revisions | Direct revision concepts + Tender BOQ | BOQ Revision — common contract, physical owner gated |
| Resource build-up | Shared core + Tender | Estimation resource build-up |
| Supplier / RFQ sourcing | Tendering | Estimation sourcing extension |
| Estimate revision | Direct governed model | Canonical Estimate Revision |
| Cost calculation | Shared estimation core | Canonical Estimation |
| Recommended price | Direct pricing concepts | Estimation recommendation |
| Customer price | CRM | Quotation |
| Quotation revisions | CRM | Quotation Revision |
| Negotiation | CRM | Quotation |
| Approval | CRM | Quotation governance |
| External quote issue | CRM | Quotation Issue |
| Tender submission | Tendering | Tender Submission — separate event |
| Acceptance | CRM | Commercial acceptance |
| Award | Tendering | Tender Award |
| Contract | Contracts | Contract and accepted commercial baseline |
| Project creation | Projects | Contract → Project handoff |
| Delivery baseline / WBS / CBS / schedule / progress | Projects | Project Delivery controls after handoff |
| Reports | Existing CRM/Tender sources | Read/composition facade |

The detailed disposition (`KEEP`, `ADAPT`, `CONVERGE`, `DEPRECATE`, `MIGRATE LATER`) and proof gate
for each row are maintained in the companion Direct-vs-Tender audit. This matrix prevents either
current label from becoming an unexamined target owner: Tender BOQ is the starting capability for a
common BOQ, and Direct EstimateRevision is the starting revision model for logical Estimation.

The approved logical contract for the shared downstream boundary is maintained in
[`Common Scope + Common BOQ Revision Contract`](2026-08-30-common-scope-common-boq-revision-contract.md).
It authorizes the logical contract only; it does not authorize a new store, route, writer or migration.

### Contract → Project Handover contract (target, not yet verified)

Contract signing/award is the gate that may create a Project. The handoff must snapshot or immutably
reference the accepted contractual delivery baseline:

```text
Contract
├── account / customer
├── sourceOpportunityId
├── sourceTenderId (optional)
├── commercialScopeRevisionId
├── boqRevisionId
├── estimateRevisionId
├── acceptedQuotationRevisionId
├── commercialBaselineId
├── originalContractValue
├── currency
├── contract dates
└── provenance / audit
          │
          ▼
Project Delivery
├── contractBaseline reference
├── deliveryScopeBaseline
├── BOQ baseline/reference
├── WBS / CBS seed
├── schedule baseline
└── quantity ledger baseline
```

Required invariants: Project creation is idempotent and downstream of a valid signed/awarded
Contract; later Tender, Estimate or Quotation edits never rewrite the created Project baseline; and
delivery changes flow through governed Variation → Approved Change → Baseline Change commands. The
current reactor proves only a partial account/value/contract handoff and Tender BOQ seeding, so the
full baseline contract remains a Phase 2.5/PD-4 proof item.

## Why this is the clean boundary

The current user journey makes one deal feel like two products:

```text
Pre-Award: Tender → BOQ → Estimation → Pricing → Generate Quotation
Sales:     Lead → Opportunity → Quotation → Negotiation → Approval
```

There is real overlap in the visible navigation and reporting, but there is not one competing database owner for every object. The domain model already separates the important facts:

- Tendering owns tender execution and source/governance facts. Its BOQ is the strongest current
  implementation, while the target is a common Commercial Scope / BOQ capability feeding one logical
  Estimation contract for cost build-up, estimate revisions, margin assumptions and recommended
  selling price across Tender and Direct Sales routes, subject to the Gap Analysis evidence.
- CRM owns customer-facing quotations and commercial decisions.
- Contracts owns the awarded engagement.
- Events carry the handoff between them.

The correct change is therefore a **facade and navigation consolidation**, not a filesystem move or
table merge. Direct versus Tender identifies the source of scope; it must not select a different
costing engine.

## Current implementation evidence

| Current concern | Evidence | Meaning |
|---|---|---|
| Separate visible suite | `apps/web/lib/suites.ts` defines `sales` and `pre-award` separately | Users see two top-level business suites |
| Two cockpit surfaces | `/crm/overview` and `/tendering` both render hero, KPIs, attention and AURA brief | Removing the label without removing the second cockpit would preserve the duplication |
| Pre-Award canonical entry | `pre-award.entryHref = '/tendering'` | Tendering is the real operational home |
| Suite catalogue drift | `suiteFunctions()` derives from `ALL_ITEMS`; `nav.ts` exposes only `/tendering/tenders` | `/suites/pre-award` shows one function while `/tendering` shows six |
| Sales Commercial facade | `apps/web/app/crm/commercial/page.tsx` explicitly says records remain owned by origin domains | The code already supports linked views without ownership transfer |
| Tender pricing ownership | Commercial workspace labels pricing as “owned by Tendering” | Current implementation ownership is route-specific; target logical ownership is the shared Estimation capability |
| CRM direct-sale Pre-Award | `modules/crm/src/domain/pre-award-package.ts` has `route: 'direct' | 'tender'` and XOR ownership | Legacy route-specific storage exists; target architecture exposes one Estimation contract/service for both sources |
| Quotation ownership | `modules/crm/src/domain/quotation.ts` owns terms, exclusions, validity, revisions, status and commercial lifecycle | Quotation is the customer-facing commercial truth |
| Tender ownership | `modules/tendering/src/domain/tender.ts` owns tender status, source, deadline and award evidence | Tender remains the bid-execution truth |
| Contract ownership | `modules/contracts/src/domain/contract.ts` references tender and commercial baseline | Contract is downstream awarded truth |

## Pre-implementation gate: single-cockpit audit

No route or domain migration should start until this split is accepted. The goal is one composition
surface, not a second Tendering screen copied into Sales.

### Navigation ownership is not domain ownership

These are deliberately separate decisions:

| Concern | Owner in the product surface | Meaning |
|---|---|---|
| Navigation / active suite / breadcrumbs | Sales / Commercial | `/crm/overview` is the cockpit and `/tendering/tenders/*` appears under Sales → Tenders |
| Tender commands and Tender data | Tendering | Qualification, source/governance, clarifications, submission and award/outcome facts remain Tendering-owned; current BOQ is exposed through the common target contract via an adapter |
| Estimation commands and data | Logical Estimation capability, **pending Gap Analysis** | One target contract; physical store/service is not assumed |
| Quotation commands and data | CRM Quotation | Customer price, revisions, approval, negotiation, issue and commercial baseline |
| Contract commands and data | Contracts | Contract lifecycle and accepted baseline reference |
| Reports and cockpit composition | Read/projection surfaces | No authoritative writes or ownership of business facts |

Sales navigation may link to or compose a record without owning its commands, persistence or
permissions. A Tender page can therefore be highlighted as Sales / Commercial → Tenders while all
Tender mutations remain guarded by Tendering policies.

### Current cockpit responsibility matrix

| Surface | What it currently does | Keep on target surface? | Decision |
|---|---|---:|---|
| `/crm/overview` (Sales Home) | CRM pipeline KPIs, opportunity attention, forecast, sales signals and quotation hints | Yes | **ONE Sales / Commercial cockpit**: commercial decision signals only; read-only composition |
| `/crm/commercial` | Linked quotation, pricing, contract, approval, margin, risk and negotiation views | Yes, as a secondary workspace | Keep it as a visible Sales navigation item labelled **Commercial** and as a link from Overview; it is a Decision Workspace, never a cockpit |
| `/tendering` | Tender KPIs, tender attention queue, tender brief and Tender shortcuts | No | Stop presenting as a cockpit; compatibility redirect/alias to Sales / Commercial after this audit is approved |
| `/tendering/tenders` | Tender register, source/status filters, deadline, pricing progress and chain links | Yes | Operational Tender workbench; Tendering remains the writer |
| `/tendering/tenders/[id]` | Tender 360, qualification, BOQ, clarifications, submission and award actions | Yes | Operational Tender 360; visible shell context becomes Sales / Commercial → Tenders |
| `/tendering/pricing` and tender pricing records | Internal cost build-up, rate resources, margin and recommended bid price | Yes, conditionally | Compatibility route to the logical Estimation workbench; physical ownership follows Gap Analysis evidence |
| `/crm/quotations` and `/crm/quotations/[id]` | Customer quotation register, revisions, terms, negotiation, approval and issue lifecycle | Yes | Canonical commercial document lifecycle and customer-facing price |
| `/crm/commercial` Reports/Margins views | Cross-domain decision summaries and links | Yes | Read-only aggregation; no new fact ownership |
| `/tendering/outcomes` / `/crm/analytics` | Outcome facts and sales/performance views | Not as competing homes | One future Commercial Reports destination; raw Tender outcomes remain Tendering-owned |

### Duplicate component/function matrix

| Current component/function pair | Duplicate risk | Canonical owner/surface | Action before migration |
|---|---:|---|---|
| `PreAwardDashboard` + `SalesDashboard` | High: both render hero, KPI cards, attention queue, AURA brief and shortcuts | `SalesDashboard` at `/crm/overview` | Do not clone `PreAwardDashboard` into Sales; retire only after `/tendering` compatibility behavior is approved |
| `SuiteDashboardShell` usage in Sales and Pre-Award | Medium: shared shell is fine, two data contracts are not | Shared shell; one Sales composition | Reuse shell primitives; keep domain-specific workbench components separate |
| Tender shortcut metadata + Sales shortcut metadata | Medium: labels/routes drift | Shared navigation/function registry (target) | Define stable function IDs and route metadata; do not dedupe by URL alone |
| Tender estimation summary + CRM Commercial Estimation tab | Medium: same values shown in two contexts | Estimation writer; Commercial read view | Reuse read models/formatters; link to the Estimation source editor |
| Direct Opportunity estimation + Tender estimation | High if treated as separate engines | One logical Estimation capability and calculation contract, **pending Gap Analysis** | Audit current stores first; do not assume one physical store/service or silently merge them |
| `Quotation 360` pricing + Estimation | Medium: cost and selling values can look identical | Estimation owns cost rationale; Quotation owns customer price/revision | Label “Estimation” vs “Quotation Pricing”; freeze issued revisions |
| `/tendering/outcomes` + `/crm/analytics` | High: win/loss and conversion are discoverable twice | Future Commercial Reports facade | Choose one report discovery route before expanding either page |
| `/crm/commercial` + `/tendering` | Medium/High: both look like decision cockpits | `/crm/overview` for attention; `/crm/commercial` for decision workspace | Remove competing Tender cockpit, not the Tender workbench |

### Proposed single Sales / Commercial cockpit composition

`/crm/overview` should answer: **“Where does commercial business need attention?”** It may compose:

1. Pipeline: opportunity value/count, weighted forecast and win rate.
2. Attention: qualification-required opportunities, tenders due soon, quotations awaiting approval or expiring.
3. Commercial journey: Lead → Opportunity or Tender → Estimation → Quotation → Approval → Issue/Lock, then either Tender Award Evidence → Contract or Direct Customer Acceptance → Contract.
4. My Work links: deep links to the exact Tender, Quotation or Opportunity action; no duplicate editor.
5. Quick access: Leads, Opportunities, Tenders, Estimation, Quotations, Contracts and Reports.

It must not show the full Tender register, BOQ editor, clarification thread, submission form or tender
pricing grid. Those remain in the Tender workbench. It may show counts, deadlines and links only.

### Exact route compatibility plan (audit recommendation)

| Route | Phase-1 behavior | Visible context | Data/command owner |
|---|---|---|---|
| `/crm/overview` | Canonical cockpit | Sales / Commercial → Overview | Read/composition only |
| `/crm/commercial` | Visible secondary Decision Workspace (not a cockpit) | Sales / Commercial → Commercial | CRM quotation/approval commands; linked reads elsewhere |
| `/tendering` | Compatibility redirect to `/crm/overview` (optional stable query such as `?focus=tenders`) | Sales / Commercial → Overview | None; no cockpit commands |
| `/tendering/tenders` | Preserve | Sales / Commercial → Tenders | Tendering register commands |
| `/tendering/tenders/[id]` | Preserve | Sales / Commercial → Tenders → Tender 360 | Tendering qualification/BOQ/clarification/submission/award commands |
| `/tendering/tenders/[id]/pricing` | Preserve | Sales / Commercial → Tenders → Estimation | Target logical Estimation commands; physical boundary follows Gap Analysis |
| `/tendering/pricing` | Preserve as compatibility URL | Sales / Commercial → Estimation | Legacy route name; target capability is Estimation, pending Gap Analysis |
| `/tendering/outcomes` | Preserve during audit; later alias from Commercial Reports | Sales / Commercial → Reports → Tender Performance | Tendering raw outcomes; report facade reads |
| `/suites/pre-award` | Compatibility alias only after approval | Sales / Commercial | No independent suite ownership |

### Remove versus reuse

**Reuse:** `SuiteDashboardShell`, `AuraDataTable`, Quotation 360, Tender 360, current estimation
editors as adapters, Commercial linked views, existing APIs, event handoffs, and read-only report
adapters. Physical stores may remain route-specific temporarily while the Gap Analysis evidence is
collected.

**Remove/deprecate after compatibility:** the Pre-Award top-level launcher card, the second Tender
cockpit entry point, duplicate shortcut metadata, and any report link that implies a second
authoritative outcome source.

**Do not remove:** Tendering domain entities, Tender 360, BOQ/clarification/submission commands,
current estimate records, or deep Tendering URLs. Do not delete or merge a store until its historical
lineage and consumers are mapped.

### Risks and regression tests required before routing changes

- **Risk:** two active-suite owners for `/tendering/*`. Test exclusive ownership and breadcrumb context.
- **Risk:** cockpit silently turns API failures into zeroes. Test unavailable vs empty states for every composed source.
- **Risk:** issued quotation revision is overwritten by a newer estimate. Test immutable issue/lock and new-revision-on-change invariants.
- **Risk:** direct and Tender estimation drift into separate engines. Test shared vocabulary, lineage and source revision references.
- **Risk:** redirect breaks saved links or E2E flows. Test `/tendering` redirect plus every deep route remains 200/authorized.
- **Risk:** permissions leak through composition. Test read-only Sales cockpit for users lacking Tender write grants.
- **Risk:** reports become a third owner. Test report payload provenance and raw-source IDs.

## Field-by-field ownership matrix

The owner in this table is the only authoritative writer. A downstream copy is allowed only when it is explicitly labelled as a reference or immutable snapshot.

| Field / fact | Authoritative owner | Authoritative entity | Primary write surface | Allowed downstream use | Duplication decision |
|---|---|---|---|---|---|
| Account identity (`accountId`) | CRM | Account | Sales Customers / Account 360 | Tender, quotation and contract reference by ID | Keep as REF |
| Account display name (`accountName`) | CRM | Account | Sales | Tender/quotation/contract name snapshot for resilient reads | SNAPSHOT-OK; never an independent editor |
| Contact identity and printed contact name | CRM | Contact / Quotation snapshot | Sales Customers and Quotation 360 | Quotation stores the issued contact snapshot | REF + issued snapshot |
| Lead identity, source and qualification | CRM | Lead | Sales Leads | Opportunity lineage via `leadId` | Keep in Sales |
| Opportunity identity and title | CRM | Opportunity | Sales Opportunities / Opportunity 360 | Tender and quotation `sourceOpportunityId` references | Keep in Sales; REF downstream |
| Opportunity stage | CRM | Opportunity | Sales Pipeline / governed outcome commands | Tender events close the source opportunity | Single CRM owner |
| Opportunity value / forecast / win probability | CRM | Opportunity | Sales Pipeline / Forecast | Report reads and event snapshots only | Do not recompute from tender value |
| Opportunity qualification (BANT/evidence) | CRM | Qualification record | Opportunity 360 | Award-time immutable qualification snapshot | Keep CRM owner; snapshot at award |
| Pursuit decision and win plan | CRM | Opportunity depth records | Opportunity 360 | Tender qualification may consume the decision context | Do not duplicate as tender status |
| Tender identity, reference and title | Tendering | Tender | Tenders Register / Tender 360 | Quotation and contract source references/snapshots | Keep in Tendering |
| Tender source (`invitation`, `public`, `private`, `opportunity`) | Tendering | Tender | Tender Register | Commercial reports filter by source | Single Tendering owner |
| Tender owner and submission deadline | Tendering | Tender | Tender Register / Tender 360 | Attention queues and report dimensions | Single Tendering owner |
| Tender lifecycle status | Tendering | Tender | Governed Tender commands | Opportunity/contract reactors consume events | Never create a CRM shadow status |
| Bid / No-Bid score, recommendation and evidence | Tendering | Bid score records | Tender 360 Qualification | Sales can display the latest recommendation | Read-through; no second decision store |
| BOQ lines, quantities, units and tender scope | Tendering (current) | BOQ + BOQ items | Tender 360 adapter | Estimate, pricing, quotation-line and project-CBS snapshots | Adapt toward common Commercial Scope / BOQ; preserve Tender source semantics |
| Rate build-up resources | Estimation capability | Estimate resources / cost lines | Estimation workbench | Tender and Direct routes consume the same calculation contract | Single Estimation owner |
| Estimate identity | Estimation capability | Estimate | Estimation workbench reached from Direct or Tender | Opportunity/Tender and Quotation reference by ID | One Estimation owner |
| Estimate revision | Estimation capability | Estimate revision | Estimation workbench | Quotation stores the source revision/snapshot | Independent from Quotation revision |
| Material, labour, subcontract, plant and transport cost | Estimation capability | Estimate cost lines | Estimation workbench | Read-only cost rationale in Sales/Commercial | No Tender-specific or CRM-specific costing writer in target |
| Indirect cost, overhead, risk allowance and profit assumption | Estimation capability | Estimate revision assumptions | Estimation workbench | Quotation margin analysis reads the snapshot | One calculation contract |
| Target margin and recommended selling price | Estimation capability | Estimate revision | Estimation workbench | Input to Quotation creation; snapshot after creation | Estimation owns recommendation, not customer authority |
| Source BOQ / scope | Tendering or CRM Opportunity | Tender BOQ / Opportunity Scope | Tender 360 or Opportunity 360 | Estimation consumes source lineage | Source differs; Estimation engine does not |
| Customer commercial price | Quotation | Quotation revision | Quotation 360 | Client document and Contract basis | Quotation is commercial truth |
| Submission method, portal, reference and addenda acknowledgement | Tendering | TenderSubmission | Tender 360 Submission | Outcome and audit reports | Single Tendering owner |
| Submission value at submission time | Tendering | TenderSubmission snapshot | Submission command | Outcome comparison and report history | SNAPSHOT-OK; never rewrite from current tender value |
| Clarifications, addenda, answers and response state | Tendering | TenderClarification | Tender 360 Clarifications | Submission acknowledgement and report context | Single Tendering owner |
| Quotation number, revision and parent revision | CRM | Quotation | Sales Quotations / Quotation 360 | Contract references accepted quotation/baseline | Single CRM owner |
| Customer-facing line description, quantity and sell price | CRM after quotation generation | Quotation lines | Quotation 360 / Pricing | Client document and contract basis | Quotation is commercial truth; tender source is historical snapshot |
| Discount and commercial adjustments | CRM | Quotation / commercial pricing | Quotation 360 | Approval and negotiation | Do not add discount fields to Tender as a competing quote editor |
| Terms, exclusions, payment and delivery conditions | CRM | Quotation | Quotation 360 | Client document, negotiation, contract handoff | Single CRM owner |
| Validity / issue date | CRM | Quotation | Quotation 360 | Client-facing document and expiry reporting | Single CRM owner |
| Quotation status | CRM | Quotation | Governed quotation actions | Contract and opportunity reactors consume events | Single CRM owner |
| Issued/submitted quotation revision | CRM Quotation | Quotation revision | Quotation 360 issue/submit command | Immutable historical commercial document | No edits after issue; any change creates a new revision |
| Estimate revision lineage on quotation | Estimation → Quotation snapshot | Quotation revision source reference | Quotation creation/revision command | Audit trail from quote to exact estimate revision | Later Estimate revisions never update an issued quotation |
| Quotation negotiation history | CRM | Negotiation / quotation revisions | Sales Commercial / Negotiation | Reports and activity timeline | Single CRM owner |
| Quotation approval decision | CRM | Approval readiness / quotation baseline | Quotation 360 / Commercial Decision Queue | Locks the commercial baseline | Single CRM owner; no Tender approval shadow |
| Approved commercial baseline | CRM | Locked quotation baseline | Quotation approval | Contract references `commercialBaselineId` | Immutable SNAPSHOT-OK |
| Awarded value, currency, date and evidence document | Tendering governed award | Tender award evidence | Tender 360 Award dialog | Opportunity closure and contract handoff events | Single governed Tendering command |
| Win / loss result and debrief reason | Tendering raw outcome | TenderOutcome / WinLossService | Tender outcome command | Sales / Commercial Reports read the outcome | One raw fact; unified report facade |
| Competitor bids and winning competitor | Tendering raw outcome | TenderOutcome competitors | Outcome capture | Commercial Reports competitor analysis | One raw fact; no CRM competitor copy |
| Opportunity won/lost projection | CRM | Opportunity stage | Event subscriber from tender/quotation | Sales pipeline and forecast | Derived projection, not a second outcome writer |
| Contract identity, status and awarded value | Contracts | Contract | Contract workspace / award reactor | Project and finance consumers | Single Contracts owner |
| Contract tender and quotation references | Contracts | Contract references | Award/quotation handoff | Traceability | REF; no duplicate contract in Sales |
| Project handoff and delivery baseline | Projects | Contract baseline + Project/WBS/CBS/schedule/quantity ledger | Contract signed reactor | Delivery dashboards | Immutable downstream reference/snapshot; governed variations only |
| Actor, timestamps and audit trail | Core / originating domain | Domain events + audit log | Every governed command | All reports and dossiers | Append-only evidence; never hand-entered in a report |

### Important distinction: Estimate versus Quotation

Direct versus Tender determines the **source context**, not a permanently separate commercial
definition chain. The target contract is:

```text
Tender source ───────┐
                     ├──► Commercial Scope → BOQ revision
Opportunity source ──┘                 │
                                       ▼
                              ONE ESTIMATION capability
                                       │
                               Estimate revision
                                       │
                         resource/cost build-up + sourcing
                                       │
                         overhead, risk, profit, recommendation
                                       ▼
                                  QUOTATION revision
```

The single Estimation capability owns estimate identity, revisions, material, labour, subcontract,
plant, transport, indirect cost, overhead, risk allowance, profit assumption, target margin and
recommended price. A quotation owns the customer-facing selling price, discounts, terms, validity,
negotiation, approval and issue state.

An **Estimate revision is not a Quotation revision**. A quotation records the exact Estimate revision
and snapshot from which it was created. Updating a later Estimate revision must never silently update
an issued quotation revision.

### Quotation freeze invariant

Every quotation revision becomes immutable immediately after external issue/submission. Any later
commercial modification — including one made by an administrator — MUST create a new quotation
revision. There is no supported `edit issued revision` path:

```text
Q-100 Rev 0 → ISSUED → 🔒 IMMUTABLE
                         │ client requests discount
                         ▼
                       Rev 1 → DRAFT → APPROVE → ISSUE → 🔒 IMMUTABLE
                         │ scope changes
                         ▼
                       Rev 2 → DRAFT
```

Estimate and quotation lineage must remain explicit:

```text
E-500 Rev 3 ──snapshot──► Q-100 Rev 0 (issued, immutable)
E-500 Rev 4 ──snapshot──► Q-100 Rev 1 (new revision, then issued)
```

### Approval baseline versus issued revision

These are two separate locks and must not be conflated:

| Boundary | Invariant |
|---|---|
| Estimate approved/frozen, if applicable | Preserves the selected Estimate revision semantics and source snapshot |
| Quotation approval | Locks the approved Commercial Baseline used for downstream decisions |
| Quotation external issue/submit | Locks the entire customer-facing Quotation revision |
| Negotiation/change after issue | Creates a new Quotation revision; never edits the issued revision |
| New Estimate revision | Never mutates an already issued Quotation |
| Tender Award Evidence | Tender-owned downstream evidence path |
| Direct Customer Acceptance | CRM/Quotation commercial acceptance path |
| Contract creation | References the accepted/frozen commercial basis, not a mutable latest quote |

`APPROVED` is therefore not the same state as `ISSUED`; Commercial Baseline locking does not replace
the customer-facing revision immutability rule.

### Direct-sale and Tender symmetry

Opportunity 360 and Tender 360 keep different workflow tabs, but both expose the same Estimation
capability. Tender owns qualification, BOQ/scope, clarifications, submission and outcome facts;
Opportunity owns CRM qualification and forecast facts. Neither owns a private costing engine in the
target architecture.

## Duplicate-page matrix

“Duplicate” here means two surfaces ask the user to do substantially the same job. Related pages that operate on different entities are intentionally retained and linked.

| Surface A | Surface B | Duplicate level | What overlaps | Recommended canonical UX |
|---|---|---:|---|---|
| `/suites/pre-award` | `/suites/sales` | High | Both are generic suite discovery pages | Remove Pre-Award from visible top-level suites; preserve a compatibility redirect/alias to Sales |
| `/tendering` | `/crm/overview` | High | Both present a KPI/attention/brief cockpit for the same commercial journey | Keep `/crm/overview` as the only cockpit; `/tendering` becomes a compatibility redirect, not a renamed dashboard |
| `/tendering/tenders` | `/crm/opportunities` | Low | Both are registers of commercial work | Keep separate: Opportunity is CRM deal intent; Tender is bid execution |
| `/tendering/tenders/[id]` | `/crm/opportunities/[id]` | Low/Medium | Both are 360 views and show account/value/lineage | Keep separate domain 360s; add prominent cross-links and a shared deal-chain header |
| `/tendering/tenders/[id]/pricing` | `/crm/quotations/[id]/pricing` | Medium | Both show cost factors, sell values and margin | Use one Estimation capability; quotation pricing remains commercial revision editor over an immutable estimate snapshot |
| `/tendering/pricing` | CRM Commercial Pricing tab | Medium | Cross-tender estimation summary and commercial pricing overview | Make Commercial a linked read-only view; keep Estimation as the cost source and `/tendering/pricing` as a compatibility editor route |
| `/tendering/outcomes` | `/crm/analytics` | High | Win/loss, value and performance reporting | Replace competing report destinations with Sales / Commercial Reports sections and one shared query model |
| `/tendering/outcomes` | `/crm/commercial` | Medium | Decision-facing margin/outcome views | Commercial Reports owns discovery; Tendering owns raw outcome capture |
| `/crm/quotations` | `/crm/commercial` Quotations tab | Low | Quote rows and status/value summaries | Keep Quotations as CRUD/register; Commercial as decision queue and linked workspace |
| `/crm/quotations/[id]/pricing` | `/crm/commercial` Pricing tab | Low/Medium | Pricing values and margin summary | Keep quotation pricing as authoritative quote revision editor; Commercial tab is read-only summary/link |
| `/crm/opportunities/[id]/pre-award/*` | `/tendering/tenders/[id]` | Medium | Similar scope/estimate labels and potentially separate costing engines | Keep workflow-specific tabs, but route both to the same Estimation contract/service and revision rules |
| `/crm/commercial` | `/tendering` | High | Both can claim to be a commercial cockpit | `/crm/overview` is the only cockpit; Commercial is a Decision Workspace; Tendering is the operational workbench |
| `/tendering/tenders` Tenders shortcut | Suite catalogue Tenders function | Low | Same destination | Preserve one destination but use stable function IDs so BOQ/Submission/Clarification labels are not collapsed by URL de-duplication |

## Target route and navigation policy

### Visible information architecture

1. Keep **Sales / Commercial** as the only visible top-level suite for the pre-award-to-quotation journey.
2. Keep exactly one user-facing cockpit at `/crm/overview`.
3. Present Tenders as a Sales / Commercial capability, while keeping the Tender Register and Tender 360 operational.
4. Present Tendering pages with Sales / Commercial breadcrumbs and active-suite highlighting.
5. Make Reports a single Sales / Commercial destination with Tender Performance, Estimation, Quotations, Win/Loss, Competitors, Margin and Conversion sections.

### Compatibility routes

Do not break existing bookmarks, integrations, tests or deep links during the first migration:

| Existing route | Compatibility behavior | Future canonical label |
|---|---|---|
| `/suites/pre-award` | Redirect or alias to `/suites/sales` with a Pre-Award capability section | Sales / Commercial |
| `/tendering` | Redirect to `/crm/overview?focus=tenders` (or an equivalent fixed Sales destination); never render another cockpit | Sales / Commercial → Overview |
| `/tendering/tenders/*` | Keep route stable; update breadcrumbs and shell ownership | Sales / Commercial → Tenders |
| `/tendering/pricing` | Keep deep link; surface from Sales / Commercial → Estimation with source ownership text | Estimation |
| `/tendering/outcomes` | Preserve during migration; later alias/redirect to Reports → Tender Performance | Commercial Reports |
| `/crm/reports` | Expand existing redirect target into the unified report center | Commercial Reports |

### Ownership implementation note

The current `AURA_SUITES` ownership function is exclusive. Once the migration is approved, Sales /
Commercial must own `/tendering/*` for active-suite highlighting, while the historical Pre-Award URL
is only a compatibility alias. Do not let both suites claim the same path. This is a routing change,
not permission or domain-writer relocation.

## Final logical domain ownership

Technical module placement may remain unchanged during migration (for example, Quotation can remain
inside the CRM module). Logical ownership is the contract that matters:

| Domain | Owns authoritative facts |
|---|---|
| CRM | Lead, Account, Contact, Opportunity, CRM qualification and Forecast |
| Tendering | Tender, Bid/No-Bid, source/governance, Clarifications, Tender Submission, Tender Award/Outcome |
| Commercial Scope / BOQ (logical target; Gap-Analysis gated) | Common scope and measurable BOQ revisions, with Direct/Tender source adapters |
| Estimation (logical target; Gap-Analysis gated) | Estimate revisions, resources, all cost components, overhead, risk, profit, margin assumptions and recommended price |
| CRM Quotation | Customer offer, quotation revisions, selling price, discounts, terms, validity, negotiation, approval and issue |
| Contracts | Contract, accepted commercial baseline reference and contract lifecycle |
| Projects | Delivery baseline, WBS/CBS, schedule, quantity ledger, progress and governed variations after Contract handoff |
| Commercial Reports | Nothing authoritative; read/projection model only |

The target Estimation contract must accept either `sourceType = DIRECT` or `sourceType = TENDER` with
an explicit source ID and revision lineage. Whether this becomes one physical store, one service or
an adapter over multiple stores is deliberately **not decided until the Gap Analysis gate passes**.

## Next step before implementation: Estimation gap analysis

Do not instruct an agent to “implement the ADR” yet. The bounded gap analysis is now recorded in
[`2026-08-30-direct-vs-tender-estimation-capability-data-ownership-audit.md`](./2026-08-30-direct-vs-tender-estimation-capability-data-ownership-audit.md).
Review that evidence against the following required comparison areas before accepting the target:

| Area to audit | Required comparison |
|---|---|
| Entities | Direct Pre-Award package/estimate/pricing entities versus current Tender pricing/estimate entities |
| Calculations | Resource costing, overhead, risk, profit, margin and recommended-price formulas |
| Revisions | Revision numbering, parent links, draft/approved/frozen states and concurrency rules |
| APIs | Create, revise, approve, freeze, price, generate-quotation and read-model endpoints |
| Persistence | Tables/stores, foreign keys, snapshots, event records and migration constraints |
| Permissions | Who may create, revise, approve, freeze, issue and view cost data in each route |
| Consumers | Quotation generation, reports, contracts, project handoff, AI/read models and exports |
| Lineage | How `DIRECT` or `TENDER` source scope maps to Estimate revision and Quotation snapshot |
| Invariants | How issued quotation immutability and new-revision-on-change are enforced server-side |

The gap-analysis decision must identify which current stores are retained temporarily, which adapters
are needed, and the safe sequence for converging them into the one **logical** Estimation capability.
It must not silently rewrite historical estimates or issued quotations. The audit is evidence, not an
implementation authorization.

## Options considered

### Option A — Merge the user-facing surface, preserve bounded domains (recommended)

| Dimension | Assessment |
|---|---|
| User clarity | High |
| Data safety | High; no table move required |
| Delivery risk | Medium |
| Reversibility | High; compatibility routes remain |
| Domain integrity | High |

**Pros:** one visible journey, one report discovery surface, no forced ownership transfer, preserves existing APIs and deep links.
**Cons:** requires shell, route ownership, breadcrumbs, tests and function registry changes.

### Option B — Hard move all Tendering routes/components under `/sales`

| Dimension | Assessment |
|---|---|
| User clarity | High in the short term |
| Data safety | Medium; route and import churn |
| Delivery risk | High |
| Reversibility | Low |
| Domain integrity | Medium; encourages accidental CRM ownership |

**Pros:** visually simple URL structure.
**Cons:** creates migration breakage, hides the distinction between cost and commercial price, and invites business-logic duplication.

### Option C — Keep Sales and Pre-Award as separate visible suites

| Dimension | Assessment |
|---|---|
| User clarity | Low |
| Data safety | High |
| Delivery risk | Low |
| Reversibility | High |
| Domain integrity | High |

**Pros:** no migration.
**Cons:** preserves the current navigation duplication and competing report mental model.

## Required changes before refactor

1. Close the current Sales Remediation Plan's P0–P2 evidence matrix; this document does not replace that work.
2. Approve the ownership matrix in this document.
3. Confirm Sales / Commercial is the visible product surface with exactly one cockpit at `/crm/overview`.
4. Approve the **logical target** of one Commercial Definition Chain (`Scope → BOQ Revision →
   Estimate Revision → Quotation Revision → Contract → Project Handover`) with one Estimation
   capability for `DIRECT` and `TENDER` sources; do not pre-approve one physical store or service.
5. Define whether `/tendering` becomes a redirect or a Sales focus alias; keep deep Tendering URLs stable initially.
6. Decide the report canonical path (`/crm/reports` or a new Sales Reports route) before expanding `/tendering/outcomes`.
7. Freeze the distinction between internal Estimation and customer-facing Quotation Pricing.
8. Adopt the issued quotation immutability and new-revision invariant, including administrator actions.
9. Add explicit route/action permission mapping for Tender qualification, estimation, submission, award and Quotation approval.
10. Do not implement Commercial Definition Chain convergence, Shared Estimation, routing,
    persistence or domain-writer changes until the remaining Phase 2.5 execution evidence,
    final ADR acceptance and entry gates are complete.
    Existing stabilization changes remain governed by the separate remediation plan.

## Target-architecture Gate 0 — Commercial Definition Chain / Estimation Gap Analysis

This gate is **approved for the Common Scope + Common BOQ Revision logical contracts**. Physical
chain convergence and Phase 3B remain separately gated; this approval is not authorization for a new
store, route, writer or migration, and it does not pause the Sales Remediation Plan's Phase 0–2
evidence track.

```text
Current Sales Remediation Phase 0–2 evidence
      ↓
ADR Revision 3 target alignment
      ↓
Common Scope + Common BOQ Revision contract approval
      ↓
Contract→Project handover and remaining Phase 2.5 evidence
      ↓
Final ADR acceptance
      ↓
Phase 2.5 target-alignment gate
```

The current remediation plan may close its Phase 0–2 evidence before this gate. The target track may
not start Shared Estimation implementation, route migration or destructive consolidation until the
evidence package answers the gap-analysis questions, confirms the issued-quotation and estimate-
lineage invariants, and records whether convergence uses one physical store/service or a compatibility
layer over multiple stores.

Gate 0 also records the Best-of-Breed choice for each stage of the Commercial Delivery Definition
Chain. A capability may be selected as the target contract while its current writer remains in place
until parity, lineage, permissions and rollback evidence are complete.

## Target implementation phases (read-only alignment may run in parallel)

Phase 0–2 evidence closure and Phase 2.5 architecture alignment are parallel tracks. Neither grants
permission for destructive work. Phase 3A and Phase 3B require both tracks, final ADR acceptance and
their own entry gates.

### Phase 2.5 — Target Architecture Alignment

- Complete the Direct-vs-Tender Estimation capability and data-ownership audit. **Complete.**
- Convert the reviewed Best-of-Breed decisions into a stage-by-stage target contract. **Complete for
  Scope/BOQ; physical topology remains deferred.**
- Confirm the Signal → Lead → Opportunity/Tender → Scope → BOQ → Estimation → Quotation → Contract
  chain and the Direct/Tender source semantics.
- Approve Scope and BOQ as common downstream capabilities, using Tender BOQ as the strongest current
  starting implementation without making it permanently Tender-owned. **Gate 0 approved.**
- Approve the logical Estimation contract and source semantics without assuming a physical merge.
- Prove Quotation Revision Lifecycle immutability and Estimate→Quotation lineage.
- Define and prove the Contract→Project Immutable Handover contract with PD-4/PD-5 evidence.
- Confirm the Single Cockpit and Commercial Reports ownership contracts.

### Phase 3A — Surface Consolidation

- Remove or hide the Pre-Award top-level suite behind a compatibility alias.
- Make `/tendering` a compatibility redirect/alias that does not render a second cockpit.
- Add Tenders under Sales / Commercial navigation and update Tender shell context/breadcrumbs.
- Consolidate Commercial Reports discovery and duplicate shortcut metadata.
- Do not merge Estimation stores or remove Tender pricing behavior in this phase.

### Phase 3B — Commercial Definition Chain Convergence (separate gate)

- Start only after the Direct-vs-Tender parity/disposition matrix is accepted.
- Converge the chain in independently gated steps; no step implies a physical migration:
  1. Common Scope contract.
  2. Common BOQ and BOQ-revision contract, using the strongest Tender implementation as the starting
     adapter without making BOQ Tender-only.
  3. Canonical Estimation contract/adapters, preserving Direct revision/effectivity and Tender
     sourcing/RFQ evidence.
  4. Estimate → Quotation lineage and immutable snapshots.
  5. Quotation lifecycle convergence.
  6. Acceptance/Award → Contract handoff with complete lineage.
  7. Contract → Project handover after a valid signed/awarded Contract.
- Choose a canonical API plus Direct/Tender adapters or a physical convergence only when migration
  evidence proves it safe and lossless.

### Phase 4 — Governance safety

- Expose governed Tender Submission and Award commands through the web BFF.
- Replace generic Tender `Won` with Award Evidence capture.
- Replace minimal Submit with structured submission facts.
- Confirm loss/debrief and outcome recording policy.

### Phase 5 — Unified Commercial Reports

- Choose the canonical Sales Reports route.
- Move Tender Performance, Win/Loss, Competitors, Margin and Conversion discovery there.
- Keep raw outcome/competitor facts in Tendering and raw quotation/approval facts in CRM.
- Use linked views, not copied aggregates or a new report database unless scale requires a read model.

### Phase 6 — Component and contract cleanup

- Extract shared `Tender`, `Quotation`, `Outcome`, `SheetSummary` and lineage contracts.
- Centralize currency/date formatting.
- Split oversized Tender 360 panels.
- Normalize report tables, exports, filters, freshness and error semantics.

## Acceptance criteria

- A user can move from Signal → Lead → Opportunity, branch to Direct or Tender, then continue through
  Scope → BOQ → Estimation → Quotation → Issue/Submit → Acceptance/Award → Contract without changing
  visible suite context.
- Sales / Commercial is the only visible top-level suite for this journey.
- `/tendering/*` deep links continue to resolve during migration.
- Tendering remains the only writer for Tender, Bid Score, Submission, Clarification, Award Evidence
  and raw Win/Loss facts. Its current BOQ implementation is the strongest starting point, while the
  accepted target is a common Commercial Scope / BOQ contract with source-specific adapters.
- CRM remains the only writer for Lead, Opportunity, Negotiation, Terms and CRM qualification/Forecast. Quotation remains the logical owner of customer-facing commercial facts even if its technical module stays in CRM.
- The logical Estimation capability is the only target writer for Estimate identity, revisions,
  resource/cost build-up, overhead, risk, profit, margin assumptions and recommended price; current
  Direct and Tender writers remain in place until the Phase 3B chain gates pass.
- Contracts remains the only writer for Contract state.
- Contract retains source Opportunity, optional Tender, Scope/BOQ revision, Estimate revision, accepted
  Quotation revision and Commercial Baseline lineage.
- Project creation is downstream of a valid signed/awarded Contract; the Project receives an immutable
  commercial handoff and does not become a second source of Sales truth.
- Projects owns the delivery baseline, WBS, CBS, schedule, quantity ledger, progress and governed
  variations after handoff.
- Tender Submission and Direct Quotation Issue remain distinct domain events and audit records.
- Internal estimate and commercial quotation price have separate labels, permissions and audit trails.
- `/suites/pre-award` no longer advertises a competing top-level product; it redirects or aliases safely.
- Reports are discoverable from one Commercial Reports surface without losing Tendering-specific drill-downs.
- No report or facade creates a second authoritative copy of a business fact.
- The Best-of-Breed capability matrix is approved stage by stage, including explicit KEEP, ADAPT,
  CONVERGE and MIGRATE LATER decisions and all preserved Tender-only capabilities.
- Tests cover exclusive route ownership, compatibility redirects, Sales/Tender function parity, governed submission/award, and report-source provenance.
- Direct Opportunity and Tender conform to the same authoritative logical Estimation contract and calculation semantics; no route-specific competing costing algorithm remains in the accepted target. The physical service/store topology follows the Gate 0 decision.
- Every Estimate has explicit `DIRECT` or `TENDER` source lineage and revision references.
- Every externally issued Quotation revision is immutable; modifying it creates a new revision, even for an administrator.
- A Quotation revision retains the Estimate revision/snapshot that created it; later Estimate changes never update an issued quotation.
- Contract stores the accepted commercial baseline, not a mutable “latest quotation” pointer.
- `/crm/overview` is the only cockpit; `/crm/commercial` is a Decision Workspace; `/tendering` does not render a dashboard.
- Reports are read/projection only and never become business-data owners.

## Final recommendation (revision requested)

Approve **Option A after this revision is accepted**. Merge Pre-Award into the Sales / Commercial
experience, retain Tendering as the bounded domain for tender source/governance facts, and converge
Scope → BOQ → Estimation → Quotation toward one Commercial Definition Chain **only after Gate 0
evidence confirms the safe logical and physical boundaries**. Both routes then converge at the
Quotation revision and immutable issue boundary, with Tender Award Evidence and Direct Customer
Acceptance as distinct paths to Contract.

This removes the user-facing “two systems for one deal” problem without sacrificing domain
correctness. The row-by-row Gap Analysis disposition is now reviewed; the next task is to close Phase
2.5 execution evidence and owner sign-off. No Shared Estimation, cockpit migration, routing,
persistence, navigation-ownership or domain-writer implementation is authorized until those conditions
are satisfied and the ADR receives final acceptance.

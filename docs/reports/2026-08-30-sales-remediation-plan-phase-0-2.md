# Sales Remediation Plan — Phase 0 to Phase 2

**Status:** Phase 0 functional/static baseline passed; Phase 1 functionally verified; Phase 2 functional parity passed; Phase 2.5 Sales scope closed with deferred convergence; Phase 3A authorization pending; Phase 3B deferred/not authorized
**Date:** 30 August 2026
**Scope:** Sales IA ownership remediation only
**Out of scope:** Phase 3 tab removal, destructive route changes, production release authorization

**Execution order lock:** Complete Sales & Commercial evidence and closure first. Project Delivery
PD‑5A/Gate A, PD‑5B, PD‑5C and Project 360 migration remain documented BLOCKED/DEFERRED and are not
implementation work in this track.

## Implementation status — current pass

The following Phase 0–2 slices are implemented and validated locally. This is slice-level validation, not closure of the phases:

- Negotiation read/write/delete now declares quotation permissions; deletion is tenant-scoped in both in-memory and Postgres stores and emits an auditable `crm.negotiation.deleted` event.
- Persisted quotation evidence checklists are enforced by the quotation approval service. A persisted `approvalReadinessMode = legacy` marker is the only compatibility exception; migration 0267 backfills existing rows to that explicit marker, makes the column `NOT NULL DEFAULT 'governed'`, and every current-domain quotation is governed and cannot use a missing checklist as an exemption.
- Commercial Decision Queue is prioritization-only; approval/cancellation opens the canonical Quotation 360 record.
- Quotation 360 now exposes record-scoped Terms, Negotiation, Approval context and Documents context without creating a second store.
- Commercial Financials consumes a canonical quotation pricing summary endpoint sourced from the same pricing projection as Quotation 360; approved reporting now reads the frozen pricing projection captured in Commercial Baseline.
- A quotation-controller permission contract test, readiness/tenant-isolation tests, legacy-bypass tests, pricing reconciliation tests and lead conversion contract tests were added.
- Phase 3A.1 additive navigation has started: Tenders, the current Estimation adapter, Commercial
  Decisions, Contracts and Reports are exposed under Sales using their existing canonical routes;
  no writer, store, migration or legacy route was removed.

Still pending for Sales closure and the future Phase 3A/3B gates: retroactive Phase 0 deep-link/favorite/audit closure, full Lead/Pipeline surface parity proof, Browser/CI release evidence and any remaining runtime route/source-truth compatibility checks. Exact shared `EstimateRevision` convergence is explicitly deferred to Phase 3B; it is not a current Phase 2.5 Sales functional blocker. Accounts/Contacts redirects, Reports catalog, and retirement of the remaining Commercial tabs remain later gated work.

## Current phase status

| Area | Status | Meaning |
|---|---|---|
| Sales IA audit | Complete | Sales pages, Commercial tabs, Customers/Accounts/Contacts, Pipeline/Opportunities, Quotations/Pricing and Reports/Analytics were audited for ownership. |
| Ownership decision | Complete | One capability has one canonical owner; portfolio surfaces may summarize and link. |
| Remediation plan | Complete | Phase 0–3 sequence and the destructive-change gate are defined. |
| Phase 0 baseline | **Pass — functional/static scope** | Mutation, permission, data/source, route/query and favorite compatibility contracts pass; Browser/CI remain separate release evidence. |
| Phase 1 | **Verified — functional governance** | Supabase readiness classification, RLS/RBAC, negotiation authorization/audit, SoD, baseline freeze, issue/revision immutability and negative controls are proven by the namespaced DB-backed release proof. Browser/CI remain separate production-release gates. |
| Phase 2 | **Pass — functional parity** | Quotation 360 context, Commercial compatibility boundary and Pipeline ↔ Leads command/surface parity pass the reviewed contract suite; Browser/CI remain separate release evidence. |
| Phase 2.5 — Sales target alignment | **Closed with deferred convergence** | Common Scope + Common BOQ Revision, Direct/Tender source semantics, quotation lifecycle, exact source-specific commercial lineage and cockpit/Reports ownership are accepted/proven. Shared physical `EstimateRevision` convergence and Contract→Project implementation remain separately gated and are not authorized in this track. |
| Phase 3A — surface consolidation | **GO — additive/non-destructive only** | The [Phase 3A Entry Review](2026-08-30-sales-phase-3a-entry-review.md) authorizes 3A.1–3A.3 composition; redirects, tab retirement and mutation removal remain separately unauthorized. |
| Phase 3B — Commercial Definition Chain convergence | **Deferred / not authorized** | No Scope/BOQ/Estimation/Quotation/Contract convergence or physical migration is authorized until its separate chain gate proves it is required and safe. |
| Production readiness | Not established | Local implementation evidence is not DB/HTTP/browser/CI release evidence. |
| Accounts/Contacts redirects | Later | Preserve current routes until migration and deep-link evidence exists. |
| Reports Center | Later | `/crm/reports` remains a redirect until the catalog is implemented. |

## Evidence matrix — current pass

The matrix separates what exists in code from what has been tested and what is still proven across the full contract. “Verified” means evidence suitable for phase closure, not merely a local build or unit test.

| Area | Implemented | Tested | Verified | Pending |
|---|---|---|---|---|
| Negotiation permissions and tenant-scoped deletion | Yes; quotation read/update/delete guards, tenant-scoped stores and deletion audit event | Controller/store/service tests plus authenticated DB-backed permission and tenant proofs pass | **Proven — functional scope** | Browser/CI release evidence |
| Route and deep-link baseline | Yes; canonical record/print/pricing routes and queue/lead/opportunity destinations have static fitness assertions | Four targeted Web fitness files pass locally (18 tests); typecheck/build pass | Partial; source-level route evidence only | Browser/CI traversal, query/favorite preservation and saved-view migration evidence |
| Data/source ownership | Baseline map plus Commercial/Overview/Analytics source-truth fitness scan | Commercial source-truth fitness passes locally (3 tests) within the targeted run | Partial; static source evidence only | Review any scan finding, then prove API/read-model lineage in HTTP/CI evidence |
| Approval readiness | Yes; persisted checklist requirements block approval for governed quotes; explicit `approvalReadinessMode = legacy` marker preserves compatibility for migrated rows | Supabase migration/readiness inspection plus namespaced governed-quotation proof pass, including governed-without-checklist and explicit-legacy cases; `NOT NULL DEFAULT 'governed'` is live | **Proven — functional scope** | Browser/CI release evidence |
| Commercial Decision Queue | Yes; prioritization and deep-link behavior, no queue mutation path | Ownership fitness passes locally (3 tests) and namespaced proof opens canonical Quotation 360 | **Proven — functional scope** | CI execution and runtime browser traversal |
| Canonical pricing summary | Yes; Commercial reads the quotation pricing projection and approved rows use the frozen baseline projection | Service reconciliation, namespaced Direct/Tender baseline and contract proofs, missing-as-unknown and tenant/bounded summary checks pass | **Proven — functional scope** | Browser/CI release evidence and broader report coverage |
| Quotation 360 context | Yes; Terms, Negotiation, Approval and Documents context added without a second store | Web fitness/build plus namespaced quotation lifecycle proof pass | **Proven — functional scope** | Runtime parity traversal and unique-action inventory before any removal |
| Leads/Pipeline parity | No closure claim | Lead conversion contract tests and API permission taxonomy tests pass locally; static parity fitness test covers shared capture, duplicate resolution and account/contact conversion choices; web production build passes | Partial | Complete Pipeline-vs-Leads contract matrix for capture, qualification and conversion, including associations, lineage, errors, permissions, duplicates and retry/idempotency; run web fitness in CI |
| Accounts/Contacts route consolidation | No | Pending | No | Redirect/query/favorite/deep-link migration evidence |
| Reports catalog | No | Pending | No | Catalog composition over existing analytics/report calculations |
| Phase 3 consolidation | Not authorized | Gate tests not complete | No | All entry-gate checks and product-owner sign-off |

## P0 closure work before any further consolidation

The following five evidence packages are required before additional remediation or any Phase 3 decision. Progress in the current pass is shown inline:

1. **Legacy checklist safety — Proven on Supabase/DB-backed HTTP:** compatibility is restricted to an explicit `approvalReadinessMode = legacy` marker; governed quotations without a checklist are blocked; `NOT NULL DEFAULT 'governed'` is live. Browser/CI release evidence remains pending.
2. **Retroactive Phase 0 baseline — Functional/static pass:** mutation, permission, data/source, route/query and favorite compatibility contracts pass; runtime Browser/CI evidence remains a release gate.
3. **Pricing reconciliation — Proven functional scope:** draft, approved locked baseline, accepted/contracted lineage, missing-as-unknown, tenant isolation and bounded summary behavior pass the namespaced DB-backed proof; Browser/CI release evidence remains pending.
4. **Lead/Pipeline parity — Partial:** canonical conversion tests cover qualification, lineage, account/contact linking, duplicates, cross-tenant rejection and idempotent replay; API permission taxonomy and shared web-flow fitness checks are present, while the full Pipeline-vs-Leads contract matrix remains pending.
5. **Phase 0–2 evidence matrix — Reviewed:** the formal closure review records functional proof separately from remaining runtime Browser/CI and Phase 0/2 compatibility work.

## Decision

Run the two evidence tracks in parallel. Some Phase 1–2 slices were implemented before the Phase 0 baseline was fully closed; this plan does not roll them back, it closes the evidence retrospectively:

```text
                         CURRENT WORK
                              │
              ┌───────────────┴───────────────┐
              │                               │
       Phase 0–2 evidence              Phase 2.5 alignment
       DB / HTTP / CI / parity         One cockpit / IA / audit
              │                               │
              └───────────────┬───────────────┘
                              ▼
                       ALL GATES GREEN
                              │
                   ┌──────────┴──────────┐
                   │                     │
              Phase 3A               Phase 3B
       Surface consolidation    Definition-chain convergence
       separate entry gate      separate parity gate
```

Phase 2.5 is read-only/design/evidence work and may proceed while Phase 0–2 closure continues. Phase
3A and Phase 3B both require the shared gate above, but they are separate decisions: surface
consolidation must not imply physical Commercial Definition Chain convergence. No old surface may be removed until its
unique actions, permissions, audit behavior, deep links and regression tests are proven at the
canonical owner.

## Architectural constraints

- One capability has one canonical owner.
- A summary, inbox or report may show a capability without owning its mutation.
- Existing data, exports, print routes, deep links and permissions must remain recoverable.
- Quotation approval remains governed by server-side segregation of duties, authority and immutable Commercial Baseline behavior.
- Current-state fact: Direct Opportunity Pre-Award and Tendering pricing are different physical workflows and must not be merged by label alone. Target-state decision: both converge through one Commercial Definition Chain (`Scope → BOQ → Estimation → Quotation → Contract → Project handover`) and one logical Estimation capability, subject to the Phase 2.5 parity audit and canonical-contract decision; no physical store/service merge is implied.
- Reports is a discovery/read-only composition layer; it must not become a second calculation or workflow engine.

## North Star alignment — Signal-to-Contract

The remediation plan now sits beneath a broader target for one Sales & Commercial suite. The target
chain is:

```text
Signal → Lead → Opportunity
                    ├─ DIRECT ───────────────┐
                    └─ TENDER → Tender 360 ──┤
                         bid/no-bid · requirements
                         clarifications · addenda
                                             ▼
                              Scope → BOQ revision → Estimate revision
                                             ▼
                              Recommended price → Quotation revision
                                             ▼
                              Approval → Issue / Submit → IMMUTABLE
                                             ▼
                              Acceptance / Award → Contract
                                             ▼
                                      Project handover
```

This is a logical Commercial Delivery Definition Chain, not a physical module or database merge.
Scope and BOQ remain distinct capabilities; Tender Submission and Direct Quotation Issue remain
separate domain events; Contract is the downstream owner of accepted commercial lineage; Project is
created only after a valid Contract. Phase 0–2 stabilization and Phase 2.5 alignment may run in
parallel, but Phase 3A/3B require both tracks to close.

## Phase 0 — Contract, route and permission baseline

### Objective

Create and close a machine-checkable baseline around the behavior that exists now and before any further behavior moves. This phase is documentation and tests first; it does not remove or redirect anything.

### Work packages

#### 0.1 Canonical ownership contract

Create a single ownership map covering:

- Leads and Lead 360.
- Opportunities and Opportunity 360.
- Direct-sale Pre-Award estimate/pricing.
- Tender-route estimate/pricing.
- Quotations, Quotation 360, quotation pricing and print.
- Commercial control surfaces.
- Customers, Accounts 360 and Contacts 360.
- Activities, Campaigns, Market Intelligence and Reports/Analytics.
- DMS document lifecycle and My Work attention queues.

The map should be consumed by tests and documentation, not maintained as a second runtime registry unless the product needs it.

#### 0.2 Route and deep-link inventory

Record current and target behavior for every affected route, including query preservation:

| Current route/surface | Target owner | Phase 0 assertion |
|---|---|---|
| `/crm/pipeline` lead board/actions | `/crm/leads` + Lead 360 | Pipeline is not yet changed; duplicate behavior is explicitly marked for later removal. |
| `/crm/accounts` | `/crm/customers?view=accounts` | No redirect yet; capture filters, pagination, favorites and tests that must migrate. |
| `/crm/contacts` | `/crm/customers?view=contacts` | No redirect yet; capture filters, pagination, favorites and tests that must migrate. |
| `/crm/quotations` and `/crm/quotations/register` | Quotations | Register remains a canonical quote list surface. |
| `/crm/quotations/[id]` | Quotation 360 | All high-risk quote commands resolve to this record context. |
| `/crm/commercial` | Commercial Control Center | Existing tabs remain available during Phase 0–2. |
| `/crm/reports` | Reports catalog | Existing redirect remains until the catalog is implemented in a later change. |
| `/crm/analytics?view=*` | Reports → Analytics family | URLs remain stable while navigation hierarchy changes later. |

Preserve print and dossier routes: account register, account dossier, client quotation and internal pricing.

#### 0.3 Mutation inventory

For each current button/form, capture method, endpoint, permission, record owner and audit event. The baseline must specifically include:

- Lead create, qualify and convert in Pipeline and Leads.
- Quotation status changes in Commercial Queue, Quotation Register and Quotation 360.
- Negotiation create/delete.
- DMS share/revoke/permission inspection.
- Forecast snapshot capture.
- Opportunity Pre-Award scope, estimate and pricing actions.

#### 0.4 Data and source ownership baseline

Record the owner of the command and the owner of the data/truth separately. A portfolio surface may
read a canonical projection, but it must not recalculate or persist a competing business truth.

| Capability | Command owner | Data/source-of-truth owner |
|---|---|---|
| Quotation approval | Quotation 360 / Quotation service | Quotation aggregate plus immutable Commercial Baseline |
| Approved margin | Quotation service / Commercial read surface | Commercial Baseline locked at approval |
| Draft pricing | Quotation Pricing | Quotation pricing projection |
| Negotiation | Quotation 360 / Negotiation API | Tenant-scoped negotiation store |
| Documents | DMS | DMS document and version stores |
| Lead conversion | Lead 360 / Lead service | Lead aggregate and conversion lineage |
| Commercial KPIs | Commercial read model | Canonical quotation, baseline, contract and CRM aggregates |

#### 0.5 Permission baseline

Snapshot the permissions and expected server checks for every mutation against the current implementation. For negotiation, verify and snapshot the newly added quotation permission guards and record-level tenant enforcement in `apps/api/src/crm/negotiation.controller.ts` and both stores. Record any remaining gap as a baseline finding; do not replace server authorization with a client-side workaround.

The baseline must also capture the approval-readiness compatibility rule and identify which quotations are legitimately legacy. A null checklist by itself is not evidence that a newly created quotation is legacy.

### Phase 0 exit criteria

- Every mutation has one identified canonical owner, even if duplicate callers still exist.
- Every affected route has a target, redirect policy and query/deep-link plan.
- Current permission and audit behavior is covered by tests or a documented gap.
- Every canonical business truth has one documented source owner, and no portfolio/read surface persists or independently recalculates a competing business truth.
- A failing test clearly identifies any new mutation added outside its owner.

The Phase 0 functional/static baseline passes. Runtime Browser traversal and CI are retained as
separate release evidence gates before any destructive route or surface change.

## Phase 1 — Governance and canonical read-model corrections

### Objective

Close the evidence for the three P0 foundations already addressed in the current pass: negotiation authorization, approval-readiness policy and commercial pricing/baseline reconciliation.

### 1.1 Negotiation permissions

**Status: Proven functional in DB-backed tests; Browser/CI release evidence pending.** Validate that:

- `GET` uses quotation-read authorization.
- `POST` uses quotation-update authorization.
- `DELETE` has explicit delete/update authority as intended.
- Tenant isolation is enforced in both stores.
- Delete behavior emits the expected auditable event.

The policy must remain tenant-scoped and record-aware; hiding a tab is not authorization.

Minimum contract tests:

- Authorized quotation reader can read negotiation history.
- Unauthorized reader cannot read another tenant's negotiation history.
- Only an authorized quotation editor can create an entry.
- Delete requires an explicit permission and writes an auditable event.
- Existing revision-linked price movement remains read-only derived data.

### 1.2 Approval-readiness backend policy

**Status: Proven on Supabase and DB-backed HTTP; Browser/CI release evidence pending.** The implemented policy is:

- A persisted checklist becomes an approval invariant once configured.
- Missing required evidence blocks approval in the quotation service.
- Only quotations explicitly marked `approvalReadinessMode = legacy` retain no-checklist compatibility; a current-domain quotation with no persisted checklist is blocked.
- Readiness failures use the existing API error taxonomy (`code = CONFLICT`), so every caller receives a stable machine-readable result.

The compatibility rule is explicit and must remain documented: a newly created quotation cannot bypass governance simply by leaving `checklist == null`. The persisted legacy/migration marker is the only compatibility path, and tests prove that new quotations without the required governance state are blocked.

The policy is enforced by the quotation service, not only by Commercial Queue or Quotation 360. The UI must link the user to the missing evidence or waiver action.

Minimum contract tests:

- The same readiness result is returned regardless of whether the command originates from a list, queue or Quotation 360.
- A preparer cannot approve their own quotation.
- Amount authority and `crm.quotation.approve` checks remain enforced.
- A waiver, if enabled, records actor, reason, timestamp and quotation revision.
- Approval still locks the immutable Commercial Baseline.

### 1.3 Canonical Commercial Pricing/Baseline Summary

**Status: Proven for the tested Sales scope; Browser/CI release evidence and broader report coverage pending.**

The current pass defines one read model for Commercial Financial Performance, Overview and Risks. Phase 1 must now prove that it uses the canonical source for each field:

| Metric | Canonical source |
|---|---|
| Quote status, issue date, validity and total | Quotation aggregate |
| Cost, profit and margin | Quotation Pricing view / approved Commercial Baseline |
| Contracted value | Contract aggregate linked to the quotation |
| Margin coverage | Presence and freshness of the canonical pricing/baseline record |
| Risk reason | Derived read-only rule with a link to the source quotation |

Do not infer `unitCost` from the customer quotation line payload when the Pricing view is the source of truth. The read model must be tenant-scoped, bounded/paged where appropriate, and expose quotation IDs for drill-down.

Minimum reconciliation tests:

- Quotation 360 margin equals Commercial Financial Performance margin for the same quotation.
- Approved quotation uses the locked baseline, not a later mutable draft value.
- Missing pricing is reported as unknown with a source link, never as zero.
- Accepted and contracted totals reconcile with the quotation and contract registers.
- Risk cards link to the exact quotation and reason.

### Phase 1 exit criteria

The functional Phase 1 gate is **VERIFIED** when all of the following are evidenced:

- Negotiation endpoints have explicit authorization and full regression/CI evidence.
- The implemented approval-readiness policy is tested from every caller, including proof that new quotations cannot use legacy compatibility as a bypass.
- Commercial margin, financial and risk metrics reconcile with canonical quotation pricing/baseline data for draft, approved and contracted states.
- Commercial's broad unbounded data loading has a bounded summary contract or an approved interim limit.

Browser execution against a marked disposable database and actual CI execution are tracked as
separate production-release evidence gates. They do not reopen the functional governance decision
when the DB-backed permissions, readiness, baseline and revision invariants above have passed.

## Phase 2 — Move unique functionality to canonical records

### Objective

Close canonical-ownership and parity evidence for Quotation 360 and Leads/Lead 360 so that later duplicate surfaces can be retired safely. Phase 2 preserves the old surfaces for comparison and rollback.

### 2.1 Quotation 360 additions

**Status: Proven functional; runtime parity traversal remains a release gate.** Quotation 360 now exposes the following record-scoped context without creating a second store:

```text
Quotation 360
├── Overview
├── Pricing
├── Revisions
├── Terms
├── Negotiation
├── Approval
├── Documents
├── Activity
└── Client Print
```

#### Negotiation

- The existing `NegotiationTab` is parameterized by one quotation.
- The existing negotiation API/store and revision-linked price movement remain the source of truth.
- Customer ask, counter, concession, competitor and scope-change fields are preserved.
- Phase 1 permissions are used for all mutations.
- Commercial retains a portfolio summary that links to this record; parity and audit preservation remain to be evidenced.

#### Approval

- Readiness, missing evidence, authority and audit context are shown on the quotation record.
- Approve/reject/cancel execute through the canonical quotation command boundary.
- Commercial Decision Queue and My Work remain attention/prioritization surfaces.
- No second approval state machine is created; contract proof remains pending.

#### Documents

- Documents and requirements linked to this quotation are shown.
- Open-in-DMS and source links are provided.
- DMS remains the owner of upload, versioning, access, sharing and revocation.
- DMS permission state is not copied into a quotation-owned store; ownership parity remains to be evidenced.

#### Terms and pricing

- Keep existing lifecycle locking for terms.
- Keep dedicated quotation pricing and internal pricing print routes.
- Explicitly label Tendering source pricing versus quotation pricing when both are linked.

### 2.2 Leads parity and source-of-truth proof

**Status: Pending. This is the main open Phase 2 workstream.**

Before any Pipeline lead action is removed:

- Prove `Pipeline Quick Capture ≡ Lead Capture` for all fields and entry paths.
- Keep Quick Capture unassigned by default; owner changes use the canonical audited `PATCH /crm/leads/:id/assign` command from Lead 360 (the capture form must not silently submit an ignored owner field).
- Prove `Pipeline Qualification ≡ Lead / Lead 360` for every qualification state.
- Prove `Pipeline Convert ≡ Lead 360 Convert` for account/contact selection and opportunity creation.
- Verify source lineage is visible from Lead 360 and Opportunity 360.
- Verify permissions, duplicate handling, conversion errors and retry/idempotency behavior where supported.
- Add deep links from any remaining Pipeline lead summary to the Lead record.
- Add regression tests for every status transition and conversion error path, not only the happy path.

Phase 2 does not remove the Pipeline lead board. It proves that Leads is ready to become the only execution owner in the future gated phase.

#### Workflow contract matrix — current evidence

| Workflow | Shared/canonical contract | Evidence present | Remaining proof |
|---|---|---|---|
| Quick Capture | Pipeline and Leads use the same `LeadCapture`; fields are company, contact, phone, email, requirement and source. Owner is intentionally assigned later through the audited `PATCH /crm/leads/:id/assign` command. | Shared-component fitness, backend duplicate-check endpoint and create validation | HTTP/CI execution and explicit tenant/permission matrix |
| Qualify | Both surfaces use `PATCH /crm/leads/:id { status: 'qualified' }`; the Lead service records one immutable qualification decision for a real transition. | Lead service lifecycle tests, API route-taxonomy test and shared UI endpoint assertions | Full browser/API contract including all invalid transitions and audit payloads |
| Convert | Pipeline and Lead 360 use the same preview/convert endpoints and drawer; account/contact link-or-create, source lineage and opportunity creation remain in `LeadConversionService`. | Conversion tests cover qualification prerequisite, associations, duplicate handling, cross-tenant rejection, lineage and idempotent replay | HTTP/CI contract, retry/error matrix and deep-link regression across both entry paths |

This matrix is evidence of parity work, not a Phase 3 authorization. Any unique capability discovered in the remaining proof must be moved to Leads/Lead 360 before a Pipeline mutation is retired.

### 2.3 Commercial compatibility surfaces

**Status: Partially implemented.**

Commercial remains visible and its current compatibility contract is moving toward the target control center:

- Overview consumes the canonical summary read model.
- Decision Queue shows ranking, readiness and risk, then opens Quotation 360.
- Financials becomes Financial Performance and consumes the canonical summary.
- Risks gain exact record drill-down.
- Quotations, Pricing, Negotiation, Documents, Approvals and Margins remain available while their replacement locations are proven.
- A fitness/contract test now fails if this component calls quotation mutation endpoints directly; all execution must open the canonical Quotation 360 command boundary. Its CI execution remains pending.
- No destructive tab removal or route redirect occurs in Phase 2.

### Phase 2 exit criteria

The functional Phase 2 parity gate passes when all of the following are evidenced:

- Quotation 360 contains the moved Negotiation, Approval context and Documents context without duplicate stores.
- All moved actions preserve permissions, audit events, revision behavior and deep links.
- Leads/Lead 360 passes parity tests for every Pipeline lead action, including associations, lineage, errors, permissions, duplicate handling and retry/idempotency.
- Commercial is a read/control surface for the moved capabilities, and a fitness test prevents it from becoming a mutation owner again.
- A rollback can restore the previous UI entry point without data migration or loss.

The reviewed contract suite now passes this functional gate. Browser traversal and CI remain separate
release evidence; legacy surfaces are still retained until a separately authorized Phase 3A change.

## Phase 2.5 — Target Architecture Alignment

**Status: Sales scope closed with deferred convergence; Contract→Project Gate A remains blocked.** This phase supersedes only target-state assumptions
from the earlier remediation plan. It does not roll back the implemented Phase 0–2 slices and it does
not authorize Shared Estimation code, route migration or destructive cleanup.

### 2.5.1 Single Cockpit

- Confirm `/crm/overview` as the only Sales / Commercial cockpit.
- Keep `/crm/commercial` as a Decision Workspace and `/tendering/*` as operational Tender workbench
  routes; do not create a second dashboard under a new label.
- Preserve deep links and shell context until route evidence is approved.

### 2.5.2 Sales / Pre-Award IA consolidation

- Map Direct and Tender entry points under one visible Sales / Commercial journey.
- Keep Tender-owned qualification, source/governance, clarifications, submission and award commands in
  Tendering; expose current Tender BOQ through the future common Commercial Scope / BOQ contract.
- Keep CRM-owned Opportunity, Quotation, negotiation, approval and customer-facing commercial facts in
  their canonical records.

### Best-of-Breed capability selection

Use the reviewed Direct-vs-Tender matrix as the target selection record. The current direction is:

- Keep CRM Signals, Leads, Opportunities, qualification and forecast as CRM-owned capabilities.
- Keep Tendering Tender 360, bid/no-bid, clarifications, addenda, submission, sourcing and award
  governance in Tendering. Treat its BOQ implementation as the strongest starting point for a common
  downstream Commercial Scope / BOQ capability, not as a permanently Tender-only owner.
- Adapt Direct governed Basis/Estimate revisions as the strongest revision candidate, while
  preserving Tender BOQ/rate-build-up and supplier sourcing through a bounded adapter.
- Keep CRM Quotation 360 as the canonical customer-price, revision, approval, negotiation and issue
  lifecycle; keep Tender Submission as a separate Tendering event.
- Keep Contracts as the owner of the accepted commercial agreement and Projects as the owner of the
  post-handoff delivery baseline, WBS/CBS, schedule, quantity ledger, progress and variations.
- Converge Scope/BOQ, Estimate→Quotation lineage and Contract handoff at the logical contract level;
  defer physical store/service convergence to Phase 3B.
- Keep Commercial Reports read/composition-only with provenance and no competing calculations.

The detailed row-by-row decisions and evidence paths live in the companion audit; this plan does not
authorize implementation merely because a capability is selected.

### 2.5.3 Direct-vs-Tender Estimation parity audit

- Review the delivered read-only audit [`2026-08-30-direct-vs-tender-estimation-capability-data-ownership-audit.md`](./2026-08-30-direct-vs-tender-estimation-capability-data-ownership-audit.md) and its reviewed KEEP / ADAPT / CONVERGE / DEPRECATE / MIGRATE LATER disposition matrix.
- Compare entities, tables/migrations, services, calculations, revisions, APIs/BFFs, UI, permissions,
  events, quotation generation, reports/exports, tests and consumers.
- Record unique Tender sourcing/BOQ behavior and unique Direct revision/pricing behavior before any
  consolidation decision.

### 2.5.4 Canonical Estimation contract

- Approve a logical contract with `sourceType = DIRECT | TENDER`, explicit source/revision lineage,
  basis revision, estimate revision, resource/cost build-up, cost outputs and optional recommended
  price.
- Keep physical stores/services route-specific until the parity evidence selects an adapter or a
  converged implementation.
- Keep `recommendedPrice` distinct from Quotation `customerPrice`.
- Include lifecycle in the contract: one Estimate has explicit `sourceType`, `sourceId` and
  `sourceRevisionId`, then an ordered revision chain (`R1`, `R2`, `R3` …) where each revision carries
  its basis, resource/cost build-up, assumptions, cost and recommended-price snapshot.
- When a Quotation uses Estimate revision `R3`, persist or immutably reference that exact revision;
  recalculation creates `R4` and never changes the financial evidence represented by `R3`.
- The logical chain is `Scope → BOQ revision → Estimate revision`; `Scope` is not a substitute for
  BOQ, and `recommendedPrice` is not `customerPrice`.

### 2.5.5 Quotation Revision Lifecycle Proof

- Prove `DRAFT → APPROVED → ISSUED/SUBMITTED → IMMUTABLE` for every quotation revision.
- Prove that any post-issue change creates a new draft revision and never mutates the issued revision
  or its Commercial Baseline.
- Keep Estimate revision locking and Quotation revision locking as separate invariants; approval is not
  the same state as external issue.
- Approval may lock governed fields or establish readiness, but `EXTERNAL ISSUE/SUBMIT` is the final
  customer-facing freeze boundary. Tests must prove approval-lock behavior separately from issued-
  revision immutability.

These locks are distinct and must be evidenced separately:

| Boundary | Required invariant |
|---|---|
| Estimate approved/frozen | Selected estimate revision and source snapshot remain stable. |
| Quotation approval | Approved Commercial Baseline is locked for downstream decisions. |
| Quotation external issue/submit | The entire customer-facing quotation revision is immutable. |
| Negotiation/change after issue | A new quotation revision is created; the issued revision is never edited. |
| New Estimate revision | It never mutates an already issued quotation. |
| Contract creation | Contract references accepted/frozen commercial basis, not a mutable latest quote. |

### 2.5.6 Estimate → Quotation lineage

- Prove Direct and Tender quotation generation retain source type, source ID, source revision and the
  exact estimate/pricing snapshot used for the draft quote.
- Prove later estimate revisions never silently rewrite an issued quotation.
- Contract creation must retain Opportunity, optional Tender, Scope/BOQ revision, Estimate revision,
  accepted Quotation revision and Commercial Baseline lineage.

### 2.5.7 Tender / Direct source semantics

- Preserve Tender as the owner of Tender source/governance, sourcing, submission and award facts;
  treat its BOQ implementation as the strongest starting adapter for the common Commercial Scope /
  BOQ capability.
- Preserve Opportunity/CRM as the owner of the Direct commercial source and customer context. Treat
  the current Direct scope implementation as an input/adapter candidate to the common Commercial
  Scope contract; do not pre-select CRM persistence as the target Scope owner.
- Explicitly classify Tender unpriced-BOQ fallback and Direct legacy SolutionScope pricing as
  compatibility behavior, governance failure or migration gap before implementation.
- Treat Direct Quotation Issue and Tender Submission as distinct events that converge only at
  acceptance/award and Contract handoff.

### 2.5.8 Commercial Reports ownership

- Confirm Reports and cockpit surfaces are read/composition-only.
- Require provenance and source IDs for cost, margin, quoted, accepted and contracted values.
- Prohibit raw-line recalculation or a competing report database unless separately approved.

### 2.5.9 Contract → Project Handover contract

Use the companion [`Contract → Project Immutable Handover Contract`](./2026-08-30-contract-project-immutable-handover-contract.md), approved with Project Delivery / PD-4 as the logical handoff contract. A valid
signed/awarded Contract must carry or immutably reference:

```text
account / customer
sourceOpportunityId
sourceTenderId (optional)
commercialScopeRevisionId
boqRevisionId
estimateRevisionId
acceptedQuotationRevisionId
commercialBaselineId
originalContractValue + currency
contract start/end dates
provenance / audit
```

Project Delivery receives a `contractBaseline` reference, delivery-scope baseline, BOQ
baseline/reference, WBS/CBS seed, schedule baseline and quantity-ledger baseline. Project creation
must be idempotent and downstream of a valid Contract. Later Tender, Estimate or Quotation changes
must never silently rewrite the created Project baseline; delivery changes use governed Variation →
Approved Change → Baseline Change commands. The [PD‑5A Gate A proof checkpoint](./2026-08-30-pd5a-gate-a-proof-checkpoint.md)
confirms that the current Contract→Project reactor proves only a partial account/value/contract handoff
plus Tender BOQ seeding; complete lineage and immutable Project-baseline behavior remain unproven.

### Phase 2.5 exit criteria

- [x] The Direct-vs-Tender audit is reviewed and every capability delta has a disposition.
- [x] The logical Commercial Definition Chain and Estimation target are accepted without selecting
      a physical store.
- [x] Common Commercial Scope / BOQ and BOQ-revision target contract is explicitly accepted at Gate 0.
- [x] The physical-boundary decision is explicitly deferred to Phase 3B; no shared store/service is
      assumed by this phase.
- [x] Quotation Revision Lifecycle Proof passes for issue, change-request and new-revision paths.
- [x] Direct and Tender exact source-specific Estimate/Quotation/Baseline/Contract lineage is
      proven; a shared physical `EstimateRevision` identity is a deferred convergence topic, not a
      current Sales functional blocker.
- [x] Contract→Project Handover contract is accepted as a logical design; implementation evidence is
      intentionally deferred with PD‑5A/Gate A.
- [x] One Cockpit, IA and Commercial Reports ownership contracts are accepted at the Sales design and
      static-fitness scope; runtime browser evidence remains a release gate.
- [x] No Shared Estimation implementation, route migration or destructive removal starts before its
      separate Phase 3B gate.

Phase 2.5 is therefore **CLOSED WITH DEFERRED CONVERGENCE** for the Sales scope. Physical
Scope/BOQ/Estimation convergence and Project handover implementation remain future gates.

## Phase 3A / 3B entry gate — future, explicit and mandatory

Neither Phase 3A nor Phase 3B may begin until all checks below are green:

- [x] Phase 2.5 target-alignment gate is closed for the Sales scope, including the Direct-vs-Tender
      disposition and Quotation Revision Lifecycle Proof; physical convergence remains a separate
      Phase 3B decision.

- [ ] Unique actions are available at the canonical owner.
- [ ] Permissions are equivalent or stricter at the canonical owner.
- [ ] Audit events and revision/baseline behavior are preserved.
- [ ] Deep links, query parameters, favorites and saved views are migrated or redirected.
- [ ] Regression tests cover success, failure, authorization and tenant isolation.
- [ ] Exports and print routes still resolve to the source owner.
- [ ] Product owner signs off on any changed approval/readiness policy.
- [ ] Rollback instructions and monitoring are ready.

### Phase 3A — Surface Consolidation

Phase 3A is limited to user-facing composition and compatibility routing:

- [ ] Pre-Award top-level suite is removed/hidden only with a compatibility alias.
- [ ] `/tendering` no longer renders a second cockpit and redirects/aliases safely.
- [ ] Tenders appear under Sales / Commercial navigation while Tendering remains the domain writer.
- [ ] Tender shell context, breadcrumbs and active-suite ownership are updated without changing
      Tender permissions or persistence.
- [ ] Commercial Reports discovery has one destination and duplicate shortcut metadata uses one
      registry.

Phase 3A does **not** merge Estimation stores, rename Tender tables or remove Tender pricing behavior.

### Phase 3B — Commercial Definition Chain Convergence

Phase 3B has a separate gate after Phase 2.5 disposition:

- [ ] The Direct-vs-Tender parity audit has a reviewed KEEP / ADAPT / CONVERGE / DEPRECATE / MIGRATE
      LATER decision for every capability.
- [ ] 3B.1 Common Scope contract is approved with Direct and Tender source semantics.
- [ ] 3B.2 Common BOQ and BOQ-revision contract is approved, using Tender BOQ as the strongest
      starting adapter without making BOQ permanently Tender-only.
- [ ] 3B.3 Canonical Estimation API/adapters pass numerical, lifecycle, permission, tenant, browser
      and CI contract tests while preserving Direct revisions and Tender sourcing/RFQ evidence.
- [ ] 3B.4 Estimate → Quotation lineage and immutable snapshots are proven.
- [ ] 3B.5 Quotation lifecycle convergence preserves customer-price ownership and issue immutability.
- [ ] 3B.6 Acceptance/Award → Contract handoff retains complete commercial lineage.
- [ ] 3B.7 Contract → Project handover is proven downstream of a valid signed/awarded Contract.
- [ ] Historical Direct and Tender revisions, sourcing links, quotation snapshots and audit events have
      a lossless migration/compatibility plan; one table/service is not assumed.
- [ ] Tender-only sourcing and source-specific submission/award semantics remain available through the
      approved target boundary.

Only after the Phase 3A gate may the team:

- Remove lead mutation controls from Opportunities.
- Replace Commercial Quotations with a summary/link.
- Merge Commercial Approvals into Decision Queue.
- Merge Commercial Margins into Financial Performance.
- Move/retire the detailed Commercial Negotiation and Documents tabs.

Only after the separate Phase 3B gate may the team converge or migrate physical Scope, BOQ,
Estimation, Quotation or Contract stores, services or routes.

## Test inventory

The implementation should add or update tests in these categories:

| Test group | Required assertions |
|---|---|
| Ownership contract | A mutation endpoint is called only by its canonical owner now; any temporary legacy exception is explicitly allow-listed, scoped and reduced each phase. |
| Route contract | Canonical routes, redirects, query preservation and deep links remain stable. |
| Permission contract | Read/write/delete/approve permissions and tenant isolation are enforced server-side. |
| Approval contract | Readiness policy, SoD, amount authority, waiver and baseline lock are consistent. |
| Quotation revision lifecycle | Approval may establish readiness/field locks; external issue/submit is the final freeze boundary; post-issue change creates a new revision and never edits the issued revision. |
| Pricing reconciliation | Quotation 360 and Commercial summary return identical cost/profit/margin for the same revision. |
| Source-truth fitness | Commercial, Overview and Analytics do not recalculate cost/profit/margin/contracted value from raw quotation lines; they consume canonical projections or aggregates. |
| Lead parity | Capture, qualify, convert, account/contact linking and error states match before Pipeline controls are removed. |
| Legacy readiness compatibility | A newly created quotation cannot bypass required readiness governance by omitting a persisted checklist. |
| Commercial ownership fitness | Decision Queue cannot call quotation mutation endpoints directly; it can only prioritize and deep-link to Quotation 360. |
| DMS boundary | Quotation context can link to DMS; quote pages cannot become a second sharing/versioning store. |
| Regression | Existing exports, print, dossier, register and 360 routes continue to work. |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Approval becomes stricter and surprises users | Publish the readiness policy, return actionable errors and support a permissioned waiver only if approved. |
| Negotiation data becomes inaccessible during move | Reuse the existing API/store, add record-level links and keep the Commercial tab until parity tests pass. |
| Margin totals change unexpectedly | Run reconciliation fixtures against quotation pricing and locked baselines before switching Commercial cards. |
| Pipeline users lose quick lead capture | Prove Lead Capture parity and add a clear link before removing Pipeline controls. |
| Redirect breaks bookmarks or saved filters | Preserve query parameters, retain record/print routes and test favorites/deep links. |
| Commercial page slows as data grows | Introduce bounded, tenant-scoped summary contracts before adding more portfolio cards. |

## Final handoff decision

Sales IA Audit — **Complete**
Ownership decision — **Complete**
Remediation plan — **Complete**
Phase 0 baseline — **Pass — functional/static scope; Browser/CI release evidence pending**
Phase 1 — **Verified — functional governance; Browser/CI release evidence pending**
Phase 2 — **Pass — functional parity; Browser/CI release evidence pending**
Phase 2.5 — **Closed with deferred convergence for Sales scope; Contract→Project implementation deferred**
Phase 3A — **GO for additive/non-destructive 3A.1–3A.3; destructive retirement not authorized**
Phase 3B — **Deferred / not authorized; separate Commercial Definition Chain convergence gate required**
Production readiness — **Not established**

Sales is not approved for destructive consolidation or production release. The current claim is limited to: **implemented slices validated locally; phase closure evidence still incomplete.**

The retroactive Phase 0 baseline and Phase 0–2 evidence matrix are updated for the implemented local
slices. Supabase development PostgreSQL is now authorized and has been inspected before applying the
bounded corrective migrations 0269–0271: readiness classification, authoritative estimation backfill,
and trigger search-path hardening. Phase 2.5.3 is delivered as a read-only Direct-vs-Tender capability/data-ownership audit
and can proceed in parallel with the remaining database/HTTP/CI evidence, accepted/contracted pricing
reconciliation and full Lead/Pipeline parity. The PD‑5A Gate A proof run is recorded in the [Gate A proof
checkpoint](2026-08-30-pd5a-gate-a-proof-checkpoint.md): Contract→Project creation and replay-safe record
counts pass locally, but the missing Project handover identity and live-Tender-BOQ CBS resynchronization
are confirmed blockers. Phase 3A and Phase 3B remain blocked until their shared evidence gate and their
separate surface/convergence decisions pass.

## Verification run — 30 August 2026

The current local evidence was re-run on `main` after the ownership and parity corrections:

| Check | Result | Scope / limitation |
|---|---|---|
| API security/readiness fitness | Pass — 4 files, 15 tests | Controller permissions, tenant-scoped negotiation deletion/audit, readiness marker, lifecycle taxonomy and fail-closed NULL reader guard |
| API HTTP/E2E Sales/Tender critical paths | Pass — 13 files, 77 tests | Lead qualification/center/lifecycle, stage gates, quotation pricing, Tender lifecycle/submission/pricing, source funnel, activities/automation, installed-base Radar and Contract→Project chain; in-memory AppModule, not disposable PostgreSQL |
| API full HTTP/E2E suite | Pass — 49 files, 269 tests | All local API E2E workflows pass in the in-memory AppModule; this still does not replace disposable-PostgreSQL, browser or CI evidence |
| CRM quotation service | Pass — 23 tests | Frozen baseline, accepted-status lineage and approval-vs-issue revision proof included |
| CRM full suite (current pass) | Pass — 427 tests; 37 skipped | Local unit/service coverage; not HTTP or database evidence |
| Tendering full suite (current pass) | Pass — 103 tests; 12 skipped | Tender estimate, BOQ, sourcing, governance and award evidence; Postgres integration remains skipped |
| Shared package | Pass — 673 tests | Domain and event contracts |
| API typecheck/build | Pass | Production compilation |
| Web typecheck/build | Pass | Production compilation and static generation |
| Migration policy check | Pass — 271 migrations | Sequence and rollback policy; Supabase `public.aura_migrations` records 271 applied AURA migration filenames through 0271 |
| ADR registry integrity | Pass — 21 ADRs | IDs, titles, statuses, links and ordering |
| Commercial source-truth scan | Pass — 3 tests within the Web 30-file/159-test run | Static source guard passes locally; CI execution is still required for release evidence |
| Web Vitest unit/fitness suite | Pass — 30 files, 159 tests | Ran with host filesystem access; browser/Playwright traversal remains separate evidence |
| Browser/Playwright smoke | **BLOCKED by safety gate** | The Playwright safety gate was executed against the Supabase-backed local API and correctly refused the unmarked shared development database; no destructive browser run was attempted. |
| Supabase PostgreSQL schema/readiness | **PASS** | 0267–0271 applied/recorded (271 AURA migration rows total); readiness column `NOT NULL DEFAULT 'governed'`, NULL rows 0, unexpected values 0, existing accepted compatible row explicit `legacy`, new/omitted value returns `governed`, trigger search path hardened. Baseline estimation projection: 1 authoritative match backfilled; 4 historical rows remain explicitly unknown because no lossless frozen source was available. |
| Supabase Sales RLS fitness | **PASS** | 230 tenant-scoped tables enabled + forced + policy-covered; key CRM/Tender tables (including quotations, baselines, pricing, estimate, BOQ) each have enforced tenant policy. |
| Supabase RLS isolation probe | **PASS — 15/15** | Restricted NOBYPASSRLS role proves cross-tenant SELECT/INSERT/UPDATE/DELETE denial, fail-closed context and no context leak. |
| DB-backed Sales HTTP | **PARTIAL** | Authenticated RBAC/tenant suite passes 16/16, live read smoke passes 5/5, and the namespaced mutation proof passes 4/4 for Lead, governed Direct quotation, Tender quotation/award and Direct accepted-quotation contract replay. Legacy no-actor fixture suites stop at the tenant-identity/module-entitlement layer (403) under auth-enabled Supabase and are not counted as domain proof; full pricing reconciliation, Pipeline/Lead surface parity, route/source ownership and CI remain open. |
| Sales mutation release proof | **PASS — 4/4** | Namespaced Supabase tenants prove Lead conversion/idempotency/lineage/audit; governed Quotation readiness→approval→baseline→issue→revision immutability; Tender BOQ→priced estimate→quotation→baseline→award→contract identity and replay, including a 409 guard on the legacy estimate-write surface after commitment; and Direct accepted quotation→baseline→idempotent contract linkage. Tender currently exposes `TenderEstimate`/rate-build-up rather than an exact shared `EstimateRevision`; this is an explicit Phase 3B convergence topic, not a current Phase 2.5 Sales functional gap. Test business rows were cleaned without deleting audit events. |
| CRM PostgreSQL integration | **PASS — 23 tests** | Qualification concurrency/rollback 2, pricing→quotation atomicity/revision 3, signal RLS/lineage 3, opportunity qualification snapshot 7 and award lineage 8; win-probability DDL proof separately passes 14/14 with the migration-owner connection. |

### Gate A proof checkpoint — 30 August 2026

The targeted Contract→Project proof was executed after the local verification run:

| Check | Result | Gate A interpretation |
|---|---|---|
| `chains.e2e-spec.ts` | Pass — 6 tests | Tender award → signed Contract → one Project + WBS over HTTP |
| `crm-source-funnel.e2e-spec.ts` | Pass — 3 tests | Direct quotation → approved baseline → Contract over HTTP |
| `@aura/projects` | Pass — 14 files / 48 tests | Project command, WBS/CBS, variation and ledger foundations |
| Gate A target invariants | **Blocked** | No Project handover snapshot/full lineage; live Tender update can rewrite Project CBS |

See the full matrix and exact source evidence in [PD‑5A / Gate A Proof Checkpoint](2026-08-30-pd5a-gate-a-proof-checkpoint.md).

These results prove implemented local slices only. They do not promote any row in the evidence matrix to `Verified`, and they do not authorize Phase 3 consolidation.

The CI workflow now declares separate Sales ownership gates for API authorization/readiness, CRM pricing/baseline lineage and web route/Lead/Pipeline fitness. Those gates are intentionally still required evidence; adding them to CI does not claim that a CI run has already passed.

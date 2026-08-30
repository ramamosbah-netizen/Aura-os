# Sales & Commercial Formal Closure Review

**Date:** 30 August 2026
**Execution target:** `main` / local workspace
**Scope:** Sales & Commercial only
**Out of scope:** Project Delivery, PD‑5A/Gate A remediation, PD‑5B, PD‑5C, Phase 3A and Phase 3B implementation

## Decision

This review classifies the current evidence against the Phase 0–2.5 exit criteria. It separates
functional phase closure from production-release evidence. No Project work, destructive
consolidation, route removal, physical Scope/BOQ/Estimation merge or production release is authorized.

| Area | Decision | Interpretation |
|---|---|---|
| Phase 0 | **PASS — functional/static baseline** | Ownership/source-truth and route/query/favorite contracts are established. Runtime Browser traversal remains a separate release-evidence gate. |
| Phase 1 | **VERIFIED — functional governance** | PostgreSQL readiness classification, RLS/RBAC, SoD, baseline freeze, issue/revision immutability and negative controls are proven in the namespaced DB-backed release suite. Browser/CI remain separate release gates. |
| Phase 2 | **PASS — functional parity** | Canonical quotation and Lead mutation behavior plus Pipeline ↔ Leads command/surface parity are proven by the complete focused contract suite. Runtime Browser traversal remains a separate release-evidence gate. |
| Phase 2.5 Sales scope | **CLOSED WITH DEFERRED CONVERGENCE** | Common Scope/BOQ contracts, Direct/Tender commercial semantics, quotation lifecycle and exact source-specific lineage are accepted/proven. A physically shared `EstimateRevision` store/API and Contract→Project implementation remain deferred to their separately authorized gates. |
| Phase 3A | **GO — additive/non-destructive only** | Functional entry prerequisites are green. 3A.1–3A.3 may compose existing destinations; redirects, tab retirement and mutation removal remain separately unauthorized. |
| Phase 3B | **DEFERRED / NOT AUTHORIZED** | Physical Commercial Definition Chain convergence is intentionally deferred to a separate future gate; this review neither evaluates nor rejects the eventual topology. |
| Production readiness | **NOT ESTABLISHED** | Browser against a marked disposable database and actual CI execution are still required. |

## Exit-criteria matrix

### Phase 0 — baseline and ownership

| Criterion | Result | Evidence / remaining work |
|---|---|---|
| One canonical mutation owner | **PROVEN** | Mutation inventory, Commercial ownership guard and namespaced Lead/Quotation/Tender proofs. |
| One authoritative source for each business truth | **PROVEN — static scope** | Commercial source-truth fitness and ownership map pass; runtime read-model provenance remains a release evidence item. |
| Permission + tenant + audit baseline | **PROVEN — functional scope** | Supabase RLS 230/230, restricted isolation 15/15, authenticated RBAC 16/16, mutation audit assertions. |
| Routes and deep links | **PROVEN — contract/static scope** | Static route and query-preservation fitness passes; Browser traversal remains release evidence. |
| Favorites and saved views | **PROVEN — implementation contract; runtime NOT RUN** | Existing SavedView/favorite E2E contract is present and no route migration has occurred; exercise it against a disposable runtime before any surface retirement. |
| Phase 0 closure | **PASS — functional/static scope** | Remaining Browser/CI evidence is release-gate work, not a discovered functional ownership gap. |

### Phase 1 — governance and canonical read models

| Criterion | Result | Evidence |
|---|---|---|
| Negotiation authorization, tenant delete and audit | **PROVEN** | Controller/store/service tests plus authenticated DB-backed permission and tenant proofs. |
| Explicit readiness classification | **PROVEN** | Supabase has 271 applied AURA migrations; `approval_readiness_mode` is `NOT NULL DEFAULT 'governed'`; NULL/unexpected counts are zero; compatible existing row is explicit `legacy`. |
| Governed quotation cannot bypass readiness | **PROVEN** | Missing checklist returns the expected 409; explicit legacy compatibility is the only exception. |
| Segregation of duties and approval authority | **PROVEN** | Different actor approval path passes; viewer/unauthorized and cross-tenant controls deny. |
| Frozen Commercial Baseline | **PROVEN** | Approval captures baseline; issue and later revisions do not mutate the frozen baseline. |
| Issued revision immutability | **PROVEN** | Post-issue mutation is rejected; change creates a new revision. |
| Pricing/read-model semantics | **PROVEN — tested scope** | Draft/approved/missing-as-unknown and baseline behavior are covered; exact accepted/contracted lineage is covered in the mutation proof. |
| Phase 1 closure | **VERIFIED — functional governance** | Remaining Browser/CI evidence is tracked as a production gate, not a reason to rebuild the governance implementation. |

### Phase 2 — canonical records and workflow parity

| Criterion | Result | Evidence / remaining work |
|---|---|---|
| Quotation 360 owns quotation execution context | **PROVEN** | Terms, Negotiation, Approval and Documents context use canonical quotation state. |
| Commercial Decision Queue is prioritization-only | **PROVEN** | Queue opens canonical Quotation 360; no direct quotation mutation path is allowed. |
| Lead capture → qualify → convert | **PROVEN — canonical command path** | Namespaced DB-backed mutation proof persists Opportunity with exact Lead lineage, audit and idempotent replay. |
| Pipeline ↔ Leads capture parity | **PROVEN — contract/static scope** | Both surfaces use the same `LeadCapture` component and canonical lead command; focused parity suite passes. |
| Pipeline ↔ Leads qualification parity | **PROVEN — contract/static scope** | Both surfaces use the canonical lead status command and shared error/permission boundary; focused parity suite passes. |
| Pipeline ↔ Lead 360 conversion parity | **PROVEN — contract/static scope** | Both surfaces use the same conversion endpoint/service and preserve duplicate/retry/account/contact semantics; focused parity suite passes. |
| Phase 2 closure | **PASS — functional parity** | No unique legacy mutation was found in the reviewed surfaces; runtime Browser traversal remains separate evidence. |

### Phase 2.5 — Sales-side target alignment

| Criterion | Result | Evidence / disposition |
|---|---|---|
| Common Scope contract | **APPROVED** | Logical contract accepted; physical owner intentionally deferred. |
| Common BOQ + revision contract | **APPROVED** | Tender BOQ is the strongest implementation seed; approval is the freeze boundary; physical convergence deferred. |
| Direct source semantics | **PROVEN** | Direct governed basis/estimate/pricing chain retains exact quotation/baseline lineage. |
| Tender source semantics | **PROVEN** | Tender BOQ → TenderEstimate/rate build-up → quotation → baseline → submission/award → contract identity passes. |
| Shared `EstimateRevision` equivalence | **DEFERRED TO PHASE 3B** | Tender currently has a source-specific `TenderEstimate` model. This is a convergence gap, not a current functional failure. |
| Quotation revision lifecycle | **PROVEN** | Approval lock and external issue immutability are tested as separate boundaries; post-issue changes create a new revision. |
| Estimate/quotation/baseline/contract lineage | **PROVEN — source-specific exact IDs** | Direct and Tender paths pin exact revision/baseline/quotation identities; no `latest` reconstruction is used. |
| One Sales cockpit / Commercial Decision Workspace | **APPROVED — static evidence** | `/crm/overview` remains the single cockpit; `/crm/commercial` is a decision workspace; runtime browser confirmation remains a release gate. |
| Reports read/composition ownership | **APPROVED — static evidence** | Reports consume canonical projections/aggregates and do not own mutations or competing pricing calculations. |
| Contract→Project implementation | **DEFERRED** | Design is approved; PD‑5A/Gate A implementation remains outside this Sales track. |
| Phase 2.5 Sales closure | **CLOSED WITH DEFERRED CONVERGENCE** | No Shared Estimation build is required to close this Sales-side scope. |

## Evidence summary

| Evidence class | Result | Notes |
|---|---|---|
| Supabase PostgreSQL | **PASS** | Real development database inspected before changes; 271 AURA migrations recorded. |
| Readiness classification | **PASS** | Existing compatible row explicit `legacy`; new/default governed; NULL and unexpected values zero. |
| RLS / tenant isolation | **PASS** | 230/230 tenant-scoped tables and restricted 15/15 isolation probe. |
| Authenticated RBAC HTTP | **PASS** | 16/16. |
| Namespaced Sales mutation proof | **PASS** | 4/4: Lead, governed Direct quotation, Tender award, Direct accepted quotation. |
| Focused Web ownership/source-truth fitness | **PASS** | Complete rerun: 6 files / 29 tests pass, including the additive Sales 3A.1 navigation contract plus route ownership, Lead/Pipeline parity, Commercial ownership, source truth, navigation and suite taxonomy. |
| Browser / Playwright | **BLOCKED — safety gate** | Safety gate correctly refused the unmarked shared Supabase database; no unsafe run attempted. This is not a functional parity failure. |
| CI | **NOT RUN** | Workflow exists, but no actual CI execution evidence is available. |

## Remaining Sales-only gates

1. Run Browser/Playwright only against a marked disposable PostgreSQL environment to collect runtime
   route, deep-link and favorite evidence.
2. Execute the declared CI workflow and record the actual result.
3. Preserve the separate Phase 3A authorization decision; no destructive work starts from this review.
   Phase 3B remains a
   separate convergence decision and must not assume a physical Shared Estimation store/service.

**Current release claim:** Sales functional governance, Phase 0 functional baseline, Phase 2 parity and
Sales-side target alignment are evidenced to the scope above. `SALES & COMMERCIAL COMPLETE` and
production readiness are **not** claimed until Browser/CI release gates pass.

# Sales & Commercial Phase 3A Entry Review

**Date:** 30 August 2026
**Execution target:** `main` / local workspace
**Scope:** additive, non-destructive Sales & Commercial surface consolidation only
**Out of scope:** Project Delivery, PD‑5A/Gate A, PD‑5B, PD‑5C, Phase 3B convergence and legacy retirement

## Decision

**Phase 3A = GO for additive/non-destructive surface consolidation.**

This authorization covers only the user-facing composition changes below. It does not authorize route
deletion, destructive redirects, mutation removal, persistence migration, physical Scope/BOQ/Estimation
convergence or any Project change.

| Gate | Result | Evidence / boundary |
|---|---|---|
| Phase 0 functional/static baseline | **PASS** | Canonical ownership, source-truth, route/query and favorite compatibility contracts are covered; 28/28 focused Web checks pass. |
| Phase 1 governance | **VERIFIED** | Supabase readiness, RLS/RBAC, SoD, baseline freeze, issue/revision immutability and negative controls pass the namespaced DB-backed proof. |
| Phase 2 Lead/Pipeline parity | **PASS — functional** | Pipeline and Leads use the same capture, qualification and conversion contracts; 28/28 focused parity/route tests pass. |
| Phase 2.5 Sales alignment | **CLOSED WITH DEFERRED CONVERGENCE** | Common Scope/BOQ contracts, Direct/Tender semantics, Quotation lifecycle, source-specific lineage, cockpit and Reports ownership are accepted. |
| Canonical destinations | **PASS** | Lead 360, Opportunity 360, Tender 360, Quotation 360, Commercial Decisions and Contracts have existing owners/routes. |
| Additive rollback safety | **PASS** | 3A.1–3A.3 compose existing routes/components without data migration or writer changes. |
| Browser / Playwright | **BLOCKED — release evidence only** | Shared Supabase database is not a marked disposable browser target; this blocks retirement/release proof, not additive implementation. |
| CI | **NOT RUN — release evidence only** | CI workflow exists but has no actual execution result in this review. |
| Phase 3A destructive retirement | **NO-GO** | Requires disposable Browser + CI evidence, compatibility proof and a separate retirement authorization. |
| Phase 3B convergence | **DEFERRED / NOT AUTHORIZED** | No physical shared Estimation store/service or Definition Chain migration is implied. |

## Authorized sequence

## 3A.1 progress checkpoint

**Status:** Implemented locally and focused-tested. The Sales navigation now exposes the existing
canonical Tenders, Estimation adapter, Commercial Decisions, Contracts and Reports destinations.
No new API writer, store, migration or route was introduced. The current run is **29/29 focused Web
checks passing**. Scope/BOQ remains a contextual capability inside Tender/Opportunity workspaces until
3A.2 defines a standalone canonical route; no placeholder route was invented.

3A.2 composition audit is now complete for the four 360 surfaces. One real Lead 360 conversion-tab
target gap was fixed and verified; no additional backend or persistence gap was found.

### 3A.1 — New Sales IA & Navigation

- Compose one visible Sales & Commercial suite around `/crm/overview`.
- Link Signals/Radar, Leads, Opportunities, Tenders, Scope/BOQ, Estimation, Quotations,
  Commercial Decisions, Contracts and Reports to their canonical existing destinations.
- Keep `/crm/commercial` as a Decision Workspace, not a second cockpit.
- Keep Tender routes as operational workbenches behind the Sales envelope.
- Reuse current navigation components, route handlers and permissions.

### 3A.2 — Canonical 360 surfaces

**Status:** Composition audit complete; Lead 360 conversion gap fixed and focused-tested. Opportunity,
Tender and Quotation 360 remain reuse/composition work, with no new domain writers authorized.

- Organize existing Lead 360, Opportunity 360, Tender 360 and Quotation 360 contexts.
- Reuse current stores, APIs, audit events and deep links.
- Do not create parallel aggregates or mutation endpoints.

### 3A.3 — Commercial surface consolidation

**Status:** **CLOSED — Commercial Decisions composed / verified.** The route is explicitly presented
as the Commercial Decisions workspace inside the single Sales cockpit. Existing quotation,
negotiation and DMS mutation surfaces remain documented `LEGACY-COMPAT` and unchanged pending a
separately authorized retirement pass.

- Present Commercial as prioritization, risk and financial decision context.
- Keep approval, negotiation, document and quotation mutations at canonical owners.
- Preserve the current Commercial route as a compatibility surface during transition.

### 3A.4 — Compatibility transition (not authorized in this review)

- Add aliases/redirects only after runtime Browser proof.
- Preserve query parameters, favorites, saved views, print routes and record deep links.
- Keep rollback to the prior entry point.

### 3A.5 — Legacy retirement candidate (not authorized in this review)

- Remove/hide duplicate navigation only after Browser + CI evidence and explicit retirement sign-off.
- Remove legacy mutations only after unique-action, permission, audit and regression proof.

## Non-negotiable constraints

- One capability has one canonical owner.
- Additive UI composition must not create a second business truth or mutation writer.
- Approval, negotiation, documents, pricing, Tender submission/award and Contract ownership remain
  unchanged.
- No database migration, persistence rewrite or physical convergence is part of 3A.
- Project remains outside this track; Contract→Project implementation stays deferred.

## Entry review result

The functional entry gate is green. Phase 3A may begin with **3A.1 New Sales IA & Navigation**.
Browser and CI remain mandatory evidence for any compatibility redirect, legacy retirement,
`SALES & COMMERCIAL COMPLETE` declaration or production readiness decision.

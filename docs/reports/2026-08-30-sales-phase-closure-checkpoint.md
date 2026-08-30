# Sales & Commercial Phase Closure Checkpoint

**Date:** 30 August 2026
**Execution target:** `main` / local workspace
**Decision:** Formal closure review completed; Phase 1 functional governance is **VERIFIED**, Sales-side Phase 2.5 is **CLOSED WITH DEFERRED CONVERGENCE**, and destructive consolidation remains **NO-GO**.

**Execution order lock:** Sales & Commercial remains the only active delivery track. PD‑5A/Gate A,
PD‑5B, PD‑5C and Project 360 migration remain documented **BLOCKED/DEFERRED** and received no new
implementation in this checkpoint.

## Executive decision

The implemented Sales, CRM and Tender slices are locally tested and the target architecture is directionally approved. Supabase PostgreSQL evidence is now available for the migrated schema, key RLS posture, CRM persistence proofs and authenticated RBAC HTTP paths. The namespaced mutation release proof now covers Lead, governed Direct quotation, Tender quotation/award and Direct accepted-quotation contract replay. Phase closure is still not claimed: the shared development database is not a disposable browser target, complete workflow-parity/route evidence and CI execution remain open.

The formal criterion-by-criterion decision is recorded in the [Sales Formal Closure Review](2026-08-30-sales-formal-closure-review.md).

Phase 3A.1–3A.3 are now complete additively: Sales navigation exposes canonical Tenders, the current
Estimation adapter, Commercial Decisions, Contracts and Reports destinations; the four canonical
360 surfaces are composed; and `/crm/commercial` is explicitly presented as the Commercial Decisions
workspace. Existing API writers, stores and legacy routes remain unchanged.

The 3A.2 [Canonical 360 Composition Audit](2026-08-30-sales-3a2-canonical-360-composition-audit.md)
found and fixed one Lead 360 tab-target gap. The 3A.3 [Commercial Decisions Composition Audit](2026-08-30-sales-3a3-commercial-decisions-composition-audit.md)
then closed the presentation gap without changing canonical writers. The additive suite is green at
32/32 focused checks.

## Phase decisions

| Phase | Decision | Evidence | Remaining gaps |
|---|---|---|---|
| Phase 0 — baseline | **PASS — functional/static scope** | Mutation/permission/source-truth maps, route/query contracts and favorite compatibility are covered; Sales route, navigation, Commercial ownership, Lead parity and source-truth fitness suites pass (29 focused checks). | Browser traversal against a marked disposable database and CI remain release evidence; no route migration is authorized yet. |
| Phase 1 — governance | **VERIFIED — functional governance** | Negotiation authorization, tenant-scoped delete/audit, governed readiness marker, segregation of duties, frozen pricing baseline, issue/revision immutability and the namespaced governed-quotation mutation path pass. Supabase has 0267–0271 recorded; readiness is `NOT NULL DEFAULT 'governed'`, existing accepted legacy data is explicit `legacy`, the trigger is fail-closed and search-path hardened, and one authoritative frozen estimation projection was backfilled without fabrication; four historical baselines remain explicitly unknown because no lossless frozen source was available. Authenticated RBAC/tenant HTTP proof passes 16/16. | Browser/CI remain production-release gates; no governance rebuild is required. |
| Phase 2 — canonical records | **PASS — functional parity** | Quotation 360 context, Commercial Decision Queue boundary, Lead capture/qualify/convert, Tender/Quotation chain, exact Tender baseline/award contract identity, Direct accepted-quotation contract replay, and Pipeline ↔ Leads parity pass the namespaced DB-backed/static contract proofs. | Browser/CI evidence remains separate release proof; no legacy surface removal is authorized yet. |
| Phase 2.5 — Sales target alignment | **CLOSED WITH DEFERRED CONVERGENCE** | Common Scope + Common BOQ Revision, Direct/Tender source semantics, quotation lifecycle, exact source-specific commercial lineage and the Sales cockpit/Reports ownership contracts are accepted/proven. The [Contract→Project Immutable Handover contract](2026-08-30-contract-project-immutable-handover-contract.md) remains design-approved only. | Shared physical `EstimateRevision` convergence and Project implementation are deferred to separate gates; no physical merge is authorized. |
| Phase 3A — surface consolidation | **CLOSED — additive/non-destructive scope** | The [Phase 3A Additive Closure Review](2026-08-30-sales-phase-3a-additive-closure-review.md) confirms 3A.1–3A.3 composition, canonical destinations and ownership boundaries. | Redirects, tab retirement, mutation removal and route deletion remain NO-GO pending Browser/CI and separate retirement sign-off. |
| Phase 3B — Commercial Definition Chain convergence | **DEFERRED / NOT AUTHORIZED** | Separate convergence gate is required after Phase 2.5 disposition. | Decide adapters versus physical migration only in that future gate; no topology decision is made here. |

## Evidence matrix

| Evidence class | Result | Scope / limitation |
|---|---|---|
| CRM module | **PASS — 427 tests; 37 skipped** | Unit/service coverage; not a database-backed release proof. |
| Tendering module | **PASS — 103 tests; 12 skipped** | Tender/BOQ/sourcing/governance coverage; PostgreSQL integration remains skipped. |
| Shared package | **PASS — 673 tests** | Domain and event contracts. |
| API security/readiness fitness | **PASS — 4 files, 15 tests** | Permission, tenant and readiness marker contracts, including the fail-closed NULL reader guard. |
| API Sales/CRM/Tender HTTP critical paths | **PASS — 13 files, 77 tests** | In-memory Nest application; focused gate paths for Lead/Pipeline, quotation governance, Tender pricing/submission, activities/automation, Installed Base Radar and Contract→Project chain. |
| API full HTTP/E2E suite | **PASS — 49 files, 269 tests** | All local API E2E workflows pass in-memory; this is not disposable-PostgreSQL evidence. |
| Web unit/fitness | **PASS — 30 files, 159 tests** | Route ownership, Lead parity, Commercial source truth and suite taxonomy included. |
| API/Web typecheck and build | **PASS** | Compilation succeeds. |
| Migration policy | **PASS — 271 migrations** | Sequential ordering and rollback markers. Supabase `public.aura_migrations` records 271 applied AURA migration filenames through 0271; schema verification shows 0267/0268 effects plus bounded 0270 projection backfill and 0271 trigger hardening. |
| PostgreSQL / Supabase | **PASS** | Real AURA development PostgreSQL inspected before changes; 271 AURA migrations recorded, including 0267–0271. Readiness has 0 NULL and 0 unexpected values; default is governed; one baseline estimation projection is an exact frozen-source match and four historical baselines remain explicitly unknown rather than fabricated. |
| RLS / tenant isolation | **PASS — 230/230 + 15/15** | All 230 tenant-scoped tables are enabled, forced and policy-covered; restricted NOBYPASSRLS probe proves cross-tenant read/write denial and fail-closed context. Supabase advisor still has separate pre-existing platform findings; they are not silently treated as Sales closure failures. |
| DB-backed Sales HTTP | **PARTIAL — 16/16 authenticated RBAC/tenant tests + 5/5 live read smoke + 4/4 mutation proof** | Authenticated permission, quotation reference, revision/account isolation, and live reads for leads, opportunities, tenders, source funnel and commercial pricing summary pass against Supabase. The namespaced mutation proof covers Lead, governed Direct quotation, Tender quotation/award and Direct accepted-quotation contract replay. Pipeline/Lead surface parity, route/source ownership closure and CI remain open; legacy no-actor fixtures stop at the tenant-identity/module-entitlement layer (403), before domain execution. |
| Sales mutation release proof | **PASS — 4/4** | Dedicated namespaced test tenants prove Lead capture→qualification→conversion, exact Opportunity lineage, idempotent replay, cross-tenant denial, audit events, governed readiness denial, SoD, evidence completion, frozen Commercial Baseline, issue freeze and revision creation; Tender BOQ→priced estimate→quotation→baseline→award→contract identity and replay, including a 409 guard on the legacy estimate-write surface after commitment; Direct accepted quotation→baseline→idempotent contract linkage. Tender still uses the existing TenderEstimate/rate-build-up model rather than an exact shared `EstimateRevision`; that is a Phase 3B convergence topic, not a current Phase 2.5 Sales functional gap. Test rows were cleaned child-first; audit events retained. |
| ADR registry integrity | **PASS — 21 ADRs** | IDs, titles, statuses, links and ordering are consistent. |
| Lint | **PASS — 633 warnings (limit 648)** | Workspace lint completes without errors; warnings are pre-existing/non-blocking under the repository threshold. |
| Browser/Playwright | **BLOCKED** | The Playwright safety gate was executed against `http://localhost:4000` and correctly refused the shared Supabase development database (`health.environment=unmarked`, `E2E_DISPOSABLE_DB=1` absent). No destructive browser run was attempted and no browser PASS is claimed. |
| CI | **NOT RUN** | `.github/workflows/ci.yml` declares disposable-PostgreSQL migration/RLS gates and a TIER-3 Playwright PostgreSQL job, but no remote/CI execution is available in this checkpoint. Local typecheck/migration-policy checks are not CI evidence. |

### Supabase security-advisor follow-up (separate from Sales gate)

The key Sales tables are RLS-enabled, forced and policy-covered (CRM leads, opportunities, quotations, pricing sheets, estimate revisions/build-ups, commercial baselines, Tender tenders and BOQs). Supabase's security advisor still reports RLS-disabled tables with policies (`aura_users`, `aura_service_accounts`) and mutable search paths on several pre-existing functions, plus the public `vector` extension. These are platform/security follow-ups, not silently remediated in the Sales track; enabling RLS without an approved policy would risk locking out system paths.

## Mandatory next gates

1. Run browser/deep-link parity only against a marked disposable database; never the shared development database.
2. Execute the declared CI ownership and source-truth gates.
3. Review compatibility/retirement separately before authorizing 3A.4 or 3A.5.

4. Keep PD‑5A / Gate A documented as BLOCKED and defer its remediation until the Sales closure decision; a passing local chain alone is not sufficient for any Project migration authorization.

The additive Phase 3A scope is closed. Browser/CI remain release evidence, while 3A.4/3A.5 and
Phase 3B require separate decisions and must not assume a physical Shared Estimation store or service.

## Current release posture

**Functional Phase 0/1/2, Sales-side Phase 2.5 and additive Phase 3A gates are evidenced; Browser/CI
release evidence remains incomplete.** No destructive changes, redirects, legacy-surface removal or
production release are authorized by this checkpoint.

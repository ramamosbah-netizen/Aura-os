# AURA OS — Final Execution Roadmap

**Date:** 2026-07-14 · Verified against live tree (`main` @ `6e099e1`).
Ordered by **dependency**, not excitement: Foundation → Authoritative truth → Core chain → Handoffs → Controls →
Work experience → Analytics → Integrations → AI. Each slice is additive; **no rewrites**. Reuses existing engines
(BOQ/estimate, workflow/saga, reactors, shared-domain rules).

Slice template fields: Objective · Business outcome · Dependencies · Modules · Migration · Invariants · API/UI ·
Events/Reactors · Tests · Definition of Done.

---

## Wave 0 — Foundation & correctness (unblock everything)

### Slice R1 — Enforce Row-Level Security (P0, G-P0-1) ← **BUILD THIS FIRST**
- **Objective:** DB-enforced tenant isolation on every business table.
- **Outcome:** no cross-tenant leakage possible even if app scoping is bypassed.
- **Dependencies:** none.
- **Modules:** all (schema); core/tenancy.
- **Migration:** additive — add `enable row level security` + `tenant_isolation_policy` (using `current_tenant_id()`)
  to every tenant-scoped table currently missing one; extend the `0049` dynamic pattern.
- **Invariants:** every tenant-scoped table has a policy; every request sets the tenant GUC.
- **API/UI:** none (infra).
- **Events/Reactors:** none.
- **Tests:** **CI fitness test** enumerating tenant-scoped tables → fail if any lacks a policy; integration test proving a
  second tenant sees 0 rows.
- **DoD:** fitness green; cross-tenant integration test passes; runbook updated. *(This is the single recommended next slice.)*

### Slice R2 — Migration deploy-gate (P0, G-P0-2)
- **Objective:** app never serves business routes against a stale schema.
- **Outcome:** the `assigned_to`-style silent 500 cannot recur.
- **Dependencies:** none.
- **Migration:** none.
- **API/UI:** boot check comparing `aura_migrations` vs `infrastructure/migrations/*`; refuse/deny business routes (or
  loud health-degraded) when behind; CI/CD migrate-before-serve gate.
- **Tests:** boot test with a pending migration → health degraded.
- **DoD:** pending-migration boot is fail-fast/visible; deploy pipeline runs migrate first.

---

## Wave 1 — Authoritative commercial truth (the front-half fix)

### Slice R3 — Commercial Baseline + governed approval (P1, G-P1-1 + G-P1-2)
- **Objective:** an immutable approved price/margin snapshot, and a real approval gate.
- **Outcome:** nothing is sent unapproved; contract value traces to an approved baseline; pricing history retained.
- **Dependencies:** R1.
- **Modules:** crm (quotation), tendering (estimate), contracts, core/workflow.
- **Migration:** `aura_commercial_baselines` (BOQ line snapshot + cost + margin + total, locked_at, source refs);
  add version columns to rate build-ups (or snapshot table) so estimates are **versioned not replaced**.
- **Invariants:** `send` requires `approved` (override = authorized + audited); over-threshold margin/discount → workflow
  approval; baseline is immutable once locked.
- **API/UI:** approval action + margin-threshold routing; baseline view on Quotation + Contract; "commercial variance"
  (baseline vs contract) indicator.
- **Events/Reactors:** `crm.quotation.approved` → write baseline; contract creation reads baseline for default value.
- **Tests:** cannot send draft; over-threshold routes to approval; approving locks an immutable baseline; re-estimate keeps history.
- **DoD:** governance enforced server-side; baseline immutable; contract shows linkage.

### Slice R4 — Pre-award discovery: Requirement → Survey → Solution → Scope→BOQ (P1, G-P1-3)
- **Objective:** capture the technical front-half and derive a priceable BOQ (incl. direct-sale).
- **Outcome:** bids/quotes start from structured scope, not spreadsheets.
- **Dependencies:** R3 (baseline consumes scope).
- **Modules:** crm + a light engineering-scope domain; tendering (BOQ generation).
- **Migration:** `aura_requirements`, `aura_site_surveys`, `aura_solution_scopes` (all opportunity-scoped, RLS).
- **Invariants:** approved scope is required to generate a BOQ; direct-sale path still produces a BOQ+build-up.
- **API/UI:** Requirement/Survey/Solution panels on Opportunity 360; "Generate BOQ from scope" action.
- **Events/Reactors:** `crm.scope.approved` → seed BOQ (reuse tendering BOQ store).
- **Tests:** scope→BOQ produces priceable items for tender and direct-sale; estimate engine prices them.
- **DoD:** end-to-end from requirement to priced BOQ, both tender and direct paths.

### Slice R5 — Bid-time sourcing into the estimate (P1, G-P1-4)
- **Objective:** ground build-up material/subcontract costs in real supplier quotes at bid time.
- **Outcome:** estimates reflect market prices; margin risk reduced.
- **Dependencies:** R3, R4.
- **Modules:** procurement (pre-award RFQ), tendering (build-up).
- **Migration:** link columns (rfq/quote ↔ boq item / build-up component).
- **Invariants:** a build-up component may reference a supplier quote; quote change flags the estimate stale.
- **API/UI:** "source this component" from an RFQ quote on the pricing sheet.
- **Events/Reactors:** `procurement.rfq.quote_awarded` (pre-award) → update linked build-up component.
- **Tests:** sourcing a component updates the rate; changing the quote restamps.
- **DoD:** a build-up can be sourced and stays consistent with supplier quotes.

---

## Wave 2 — Close the delivery→cash edges

### Slice R6 — Progress measurement → IPC (P1, G-P1-5)
- **Deps:** R1. **Modules:** projects, contracts. **Migration:** `aura_progress_measurements` (WBS/BOQ line, period, %/qty).
- **Invariants:** IPC drafts from approved measurement; no double-billing a period.
- **Events/Reactors:** `projects.measurement.approved` → draft IPC (feeds existing ipc.certified→AR reactor).
- **Tests:** measurement→IPC→AR chain; period idempotency. **DoD:** measured progress drives billing.

### Slice R7 — Inventory issue → Installed Asset + Warranty (P1, G-P1-6)
- **Deps:** R1. **Modules:** inventory, assets, amc. **Migration:** asset link + warranty fields; installed-from-issue ref.
- **Events/Reactors:** `inventory.stock.issued`/`projects.handover` → create/annotate Asset (warranty); AMC can attach;
  feeds S9 renewal. **Tests:** issue/handover→asset with warranty; AMC attach. **DoD:** real installed base exists.

### Slice R8 — Collection / dunning + cash visibility (P1, G-P1-7)
- **Deps:** R1. **Modules:** finance, crm. **Migration:** dunning stage on AR invoice.
- **Invariants:** overdue AR advances stages; reminders logged as activities.
- **API/UI:** dunning worklist; DSO/cash rollup. **Tests:** overdue→dunning→reminder activity. **DoD:** governed collection.

---

## Wave 3 — Controls, experience, analytics

- **Slice R9 — Authorization coverage sweep (P2, G-P2-1):** assert on every state-changing method; fitness test that
  every mutating service method calls `access.assert`. **Deps:** R1.
- **Slice R10 — Variation client-submission workflow (P2, G-P2-4)** + **AFC gate (P2, G-P2-5).** **Deps:** R3, R6.
- **Slice R11 — Reporting/projection layer (P2, G-P2-3):** event-fed read models for exec dashboards (pipeline, cash,
  project cost, backlog). **Deps:** R1, R6.
- **Slice R12 — po-match projection (P2, G-P2-2):** replace synchronous read with an event-fed projection. **Deps:** R11.
- **Slice R13 — Role-based "today" experience (P2):** per-role home (Estimator, PM, QS, Procurement, Finance, Site) —
  what needs attention / is overdue / requires a decision today. **Deps:** R6, R8, R11.

## Wave 4 — Strategic & integrations (P3–P4)

- Pricing scenarios/what-if (R14, G-P3-1) · Clarification log (R15) · Contingency/risk register (R16) ·
  Bid/no-bid governance (R17) · Comms integrations (R18, P4) · Autonomous AI actions (R19, P4).

---

## Critical path (dependency spine)

```
R1 (RLS) ─┬─> R3 (Baseline+Governance) ─> R4 (Scope→BOQ) ─> R5 (Sourcing→Estimate)
          ├─> R6 (Measurement→IPC) ─> R10 (Variation/AFC)
          ├─> R7 (Issue→Asset)
          ├─> R8 (Collection)
          └─> R2 (Deploy-gate)   R11 (Reporting) ─> R12, R13
```

## Sequencing rationale
- **R1 first** — tenancy is the only *correctness/security* blocker and underpins every multi-tenant chain; additive, no rewrite.
- **R3 before R4/R5** — a locked, governed baseline is the anchor the front-half feeds into; building scope/sourcing before
  the baseline would create rework.
- **R6–R8 in parallel** after R1 — independent delivery→cash edges, each a clean vertical slice.
- **Analytics/experience (R11–R13) after** the truth is complete — dashboards on incomplete truth mislead.

## The one next slice
**R1 — Enforce Row-Level Security.** It is the only correctness/security blocker, unblocks every tenant-scoped chain, is
purely additive (policies + fitness test, no behavioural rewrite), and closes the last open platform register row. Ship it
before any new business capability.

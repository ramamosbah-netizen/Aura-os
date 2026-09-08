# Master Gap Remediation — gaps §24 surfaced

**Date:** 2026-09-08 · **Origin:** §24 Cross-Domain Project Health · **Branch:** `feat/master-task-3-closeout-readiness`

## Why these are here rather than in §24

`engineering-approval-readiness` and `procurement-delivery-exposure` report `UNKNOWN`, and they will keep
reporting it until the owning domains record facts they do not record today. That is not a Health defect.
§24 found these and named their owners; building due dates and a delivery schedule inside §24 to make it
green would pull Engineering's and Procurement's scope into Health, which is the specific mistake the
whole two-axis design exists to prevent.

So §24 closes as **Core Verified / Coverage Partial**, and the missing capabilities are recorded here as
what they are: product gaps in Engineering and Procurement.

Each is evidenced from source and schema, checked at both levels because a domain model is often narrower
than its table. Nothing below is inferred from a status name.

---

## Engineering

| ID | Gap | Evidence | Consequence |
|---|---|---|---|
| **ENG-GAP-01** | Approval/readiness semantics undeclared | Engineering has seven status vocabularies; none states which state blocks delivery | Health cannot say whether approvals are on time; reports `UNKNOWN` |
| **ENG-GAP-02** | RFI and Submittal carry no due, required-for or impact fact | `rfi.ts` / `submittal.ts` hold status only. Confirmed at the schema: `aura_engineering_rfis` and `aura_engineering_submittals` have no date, priority or impact column | An open RFI cannot be shown to threaten anything, however long it has been open |
| **ENG-GAP-03** | `DrawingSubmission.dueDate` is optional | Nullable in model and row | "No overdue reviews" cannot mean "all reviews on time" — undated submissions are invisible |

**What already works, and should not be rebuilt.** `TechnicalQuery` declares `costImpact` and `timeImpact`
for itself, and the drawing revision aggregate is well modelled: each `(project, code, revision)` is its own
immutable row, `submitted` is reachable only from `draft`, and revising marks the source `superseded`. That
lineage is what made the overdue rule safe without a "latest submission" heuristic. `ENGINEERING_DELIVERY_IMPACT`
is built on exactly these two facts and is answering today.

---

## Procurement

| ID | Gap | Evidence | Consequence |
|---|---|---|---|
| **PROC-GAP-01** | No required-on-site / need date anywhere | No such column in PR, PO or RFQ, at model or schema | The Procurement Schedule capability has no data foundation at all |
| **PROC-GAP-02** | No expected or promised delivery date | `aura_procurement_purchase_orders` has `id, tenant_id, company_id, reference, title, supplier_name, project_id, project_name, status, value, owner_id, created_by, created_at` — no date but `created_at` | "Will material arrive in time?" is unanswerable |
| **PROC-GAP-03** | RFQ → PO lineage broken | `rfq.service.ts` `award()` marks quotes and sets `status: 'awarded'`; it never creates or links a PO. PO carries no `rfqId` | The sourcing chain `PR → RFQ → ? → PO → GRN` has a hole in the middle |
| **PROC-GAP-04** | No first-class evaluation or recommendation record | Only a `cheapestQuote` helper described as "the default award recommendation" | No evaluator, criteria, scoring or documented decision — award has no approval evidence |
| **PROC-GAP-05** | No actual received date | `GoodsReceipt` has `status` and `createdAt`; no `receivedAt` | When something actually arrived is unrecorded; `createdAt` is when the row was made, not when the lorry came |
| **PROC-GAP-06** | No long-lead or priority semantics | No priority, criticality or long-lead flag in any procurement record | Long-lead item tracking has nothing to hang on |
| **PROC-GAP-07** | RFQ cannot be attributed to a project directly | `Rfq` has `prId: Id \| null` and **no `projectId`**. An RFQ reaches a project only via `prId → PR.projectId`, and both hops are nullable | An RFQ raised without a request belongs to no project and is invisible to project health |

### On PROC-GAP-07 and the numbering

Discovery listed six. The seventh was found **during implementation**, not invented to round the list: writing
the sourcing adapter required scoping RFQs to a project, and `Rfq` turned out to carry no `projectId` — only a
nullable `prId`. The field list is `id, tenantId, companyId, reference, title, prId, prTitle, status, dueDate,
ownerId, createdAt, createdBy`. It is a genuine lineage gap with a real consequence, recorded above with its
evidence like the others.

### Procurement ↔ Inventory boundary — a question, not a defect

`GoodsReceipt` lives in `modules/inventory`, not `modules/procurement`, and carries `poId`. That may well be
correct ownership — Procurement buys, Inventory receives — so it is **not** classified as a gap. What is needed
is verification of the contract and lineage across that boundary, not a reflex to move GRN into Procurement.

---

## What §24 proved about itself

The two signals above report `UNKNOWN` rather than `CLEAR`, which forces `coverage: PARTIAL`, which stops any
project reading as fully assessed. That is the design working: a missing capability in another domain shows up
as an admitted gap on the screen instead of a clean bill of health nobody earned.

Both are also distinguishable from a wiring fault — `SEMANTICS_UNDECLARED` rather than `PROVIDER_UNBOUND` —
so nobody will go looking for a binding that was never supposed to exist yet.

---

## Separate finding — surfaced by §21, owned by the platform

**`FORCE ROW LEVEL SECURITY` is missing on ten pre-existing `aura_projects_*` tables.**

Found while reviewing the §21 migration, which had the same omission. `ENABLE ROW LEVEL SECURITY`
does not apply a policy to the table's **owner**; only `FORCE` does. Across the schema, ~65 tables
carry FORCE — every table created after the 0163/0164 RLS closure work. Inside Projects, only three
do:

| Has FORCE | ENABLE only |
|---|---|
| `aura_projects_cost_ledger` | `aura_projects_projects` ← the parent every hierarchical policy joins through |
| `aura_projects_delivery_item_maps` | `aura_projects_wbs_nodes`, `aura_projects_cbs_nodes` |
| `aura_projects_quantity_ledger` | `aura_projects_delay_events`, `aura_projects_eot_claims` |
| | `aura_projects_variations`, `aura_projects_closeouts` |
| | `aura_projects_schedules`, `aura_projects_cashflow_forecasts` |
| | `aura_projects_eot_delay_links` — **and it carries no policy at all** |

### What this is, and what it is not

It is **not** a production hole. CI's "R1 activation" step connects the API as `aura_app`
(NOSUPERUSER, NOBYPASSRLS, and not the table owner), and for a non-owner role `ENABLE` is
sufficient — the policy applies. Two independent controls guard the same boundary and one of them
holds.

It **is** a live weakness in every other posture. `apps/api/.env.local` points `DATABASE_URL` at the
compose superuser, which owns these tables, so on the local dev database and the disposable e2e
database the ENABLE-only tables have **no** row-level isolation at all.

The consequence that matters for evidence: **an RLS proof run as the owner passes vacuously on an
ENABLE-only table.** It observes no denial and reports success. That is precisely why a genuine
proof must assert `pg_class.relforcerowsecurity` and run its cross-tenant attempts under a
NOBYPASSRLS non-owner role, rather than reading the migration text and trusting the policy name.

**Remediation** is a single migration adding `FORCE` to the ten, plus a policy for
`aura_projects_eot_delay_links`. It is deliberately not folded into §21: that would bury a
schema-wide correction inside a feature branch, and the link table needs its own isolation decision
(it has no `tenant_id`, so it must isolate through its parent claim the way `aura_document_versions`
does).

---

## Separate finding — not §24, not owned here

**E2E interaction-readiness instability under full-suite execution.**

Three specs have each failed once across three full runs and passed standalone:

| Spec | Failed on |
|---|---|
| `internal-chat.spec.ts:160` | DM picker after clicking "New" |
| `my-work-dashboard.spec.ts:71` | "Filter by module" after clicking "Filters" |
| `admin-control-center.spec.ts:81` | "Backup & Restore" after clicking an operations control — **twice** |

All three wait on an element revealed by a **click**, never on navigation. An earlier theory that this was
`next dev` compiling routes on demand does not hold: the failing waits are inside already-loaded pages, and in
the run that failed, `admin-control-center.spec.ts:48` ("Overview renders without a client-side exception")
passed against the same route.

The recurrence on `admin-control-center` makes this more than chance. It is not diagnosed, and it is not a §24
defect. Recorded here so it is not lost, and so nobody attempts to close it by re-running the suite until it
goes green.

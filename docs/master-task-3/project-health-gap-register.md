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

## Withdrawn — a §21 finding that was wrong

An earlier revision of this file claimed ten `aura_projects_*` tables were `ENABLE`-only and lacked
`FORCE ROW LEVEL SECURITY`. **That claim was false and is withdrawn.**

It came from grepping the migrations for literal `ALTER TABLE … FORCE ROW LEVEL SECURITY`
statements. Migration 0163 does not write them that way: it applies `ENABLE` + `FORCE` through a
dynamic loop over every `aura_*` table carrying a `tenant_id` column —

```sql
EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
```

— so a grep for the literal statement sees none of it. Tables created *before* 0163 were swept by
that loop; only tables created *after* it need their own explicit `FORCE`, which is why 0281 writes
one per table and why the §21 migration genuinely needs one.

**Grepping source for a database property proves nothing about the database.** The posture is a fact
in `pg_class`, and the audit that replaces this section reads it there.

Two things from the withdrawn entry are worth carrying forward as questions for that audit, neither
asserted here:

- `aura_projects_eot_delay_links` has **no `tenant_id` column**, so 0163's loop could not have seen
  it, and no migration attaches a policy to it by name.
- `apps/api/scripts/rls-fitness.mjs` already enforces "enabled, FORCED, and at least one policy" for
  every `tenant_id` table as a CI gate, with a small justified allowlist. Whether anything in
  Projects reaches that allowlist is a fact to read, not to infer.

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

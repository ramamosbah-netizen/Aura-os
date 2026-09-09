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

## AURA-RLS-001 — tables outside both tenant-isolation controls

**Read from `pg_class` on a fresh database migrated 283/283, not from migration text.** Full run:
[`s21-db-proof-2026-09-09.md`](./s21-db-proof-2026-09-09.md) ·
harness `apps/api/scripts/s21-risks-issues-db-proof.mjs`.

### First, a withdrawal

An earlier revision of this file claimed ten `aura_projects_*` tables were `ENABLE`-only. **That was
false.** It came from grepping for literal `ALTER TABLE … FORCE ROW LEVEL SECURITY`; migration 0163
applies it through `EXECUTE format(...)` in a loop over every `aura_*` table with a `tenant_id`, so
the grep saw none of it. The live read settles it: **15 of the 16 `aura_projects_*` tables are
ENABLE + FORCE with a policy.** Grepping source proves nothing about a database.

### The finding that survives

| Table | ENABLE | FORCE | policies | Why both controls missed it |
|---|---|---|---|---|
| `aura_projects_eot_delay_links` | ✗ | ✗ | 0 | **No `tenant_id` column** |

0163's loop selects on the presence of `tenant_id`, and `rls-fitness.mjs` — the CI gate that
enforces "enabled, FORCED, at least one policy" — discovers the same way. A table with no
`tenant_id` is invisible to both, which is the exact blind spot that script's own header warns
about. It is a link table between EOT claims and delay events, so it is not itself sensitive, but
it joins two tables that are.

Eleven other `aura_*` tables share the shape and were each read rather than assumed:

- **No RLS, and worth a decision:** `aura_access_grants`, `aura_access_roles` — RBAC data, keyed by
  user rather than tenant. Possibly correct; not verified here, and not assumed either way.
- **No RLS, and plainly fine:** `aura_migrations`, `aura_environment`, `aura_webhook_deliveries`.
- **ENABLE + policy, no FORCE — isolating through a parent:** `aura_calendar_adjustments`,
  `aura_calendar_holidays`, `aura_feature_flags`, `aura_finance_journal_lines`,
  `aura_projection_status`. `aura_document_versions` does the same and *is* forced, so the pattern
  is inconsistent rather than absent.

Across the whole schema, the only tables carrying `tenant_id` without ENABLE + FORCE + a policy are
the five on `rls-fitness.mjs`'s own allowlist — `aura_events`, `aura_service_accounts`,
`aura_users`, `aura_vector_store`, `aura_webhook_subscriptions`. **No unexplained gap exists among
tenant-scoped tables.**

### AURA-RLS-002 — the dev and migration connection is a SUPERUSER

`aura` is `rolsuper = true, rolbypassrls = true`. `aura_app` is `NOSUPERUSER, NOBYPASSRLS`, owns no
table, and is a member of no role, so it cannot `SET ROLE` to the owner.

This is the correction to something stated loosely earlier, and it is sharper than the original
claim. It is **not** that "local dev connects as the owner, so `ENABLE`-only tables are
unprotected". It is that local dev connects as a **superuser**, which bypasses RLS entirely —
neither `ENABLE` nor `FORCE` binds one, because `FORCE` binds a non-superuser *owner*.

Two consequences worth separating, since conflating them is how a vacuous proof gets believed:

- **Policy enforcement for the runtime role.** `aura_app` is a non-owner NOBYPASSRLS role, so
  `ENABLE` alone already applies the policy to it. This is the control actually doing the work, and
  it is proven live in section B4 of the report.
- **Defence against owner execution.** `FORCE` is what would bind a non-superuser owner. Since this
  deployment's owner is a superuser, FORCE cannot be exercised from here at all — it is
  defence-in-depth for a posture not currently in use, not today's protection.

The operational rule that follows: **any RLS proof run on the `aura` connection passes vacuously.**
Isolation must be attacked from `aura_app`, which is what the harness does.

### Remediation — deliberately not done here

A migration adding a claim path for `aura_projects_eot_delay_links`, and a decision on the RBAC
tables. Folding either into §21 would bury a schema-wide correction inside a feature branch, and the
link table needs its own isolation decision because it has no `tenant_id` to isolate on — it would
have to reach through a parent claim the way `aura_document_versions` does.

---

## AURA-PM-002 — Resource Actual Lineage Gap

Site's actual labour and plant usage carries no stable reference to the resource it consumed, so
plan-vs-actual reconciliation cannot be made deterministic.

| Actual record | Identifies the resource as | A stable id exists in |
|---|---|---|
| `PlantUsage.equipment` | free text — *"description **or** asset code"* | Assets `Asset`, Fleet `Vehicle` |
| `LabourAllocation.trade` | free text | nowhere — no trade register exists |
| `LabourAllocation.subcontractorName` | free text | Procurement `Supplier` (`category: 'subcontractor'`) |

So `TC-01`, `Tower Crane TC-01` and `Tower crane 1` are three resources, and a plan that books
`Asset:9f3c…` can never be matched against the day it was used.

**What this does and does not block.** It does **not** block cross-project double-booking
prevention — that works entirely on the planning side, where stable ids already exist. It means §22
will be able to answer *"is this crane double-booked?"* and unable to answer *"did we use the crane
we planned?"*, which is a different and later question.

**Deliberately not fixed inside §22.** Adding `assetId` / `employeeId` / `supplierId` to Site's
records changes a module §22 does not own, sideways, to make a Projects feature tidier. It belongs
to the PM final capability audit, alongside the same lineage shape already recorded as PROC-GAP-03
and PROC-GAP-07.

---

## AURA-PM-001 — a project risk has an owner's NAME, not an owner

Surfaced by wiring §21 into My Work, which is where it first cost something.

`ProjectRisk.owner` and `ProjectIssue.owner` are free text. That was deliberate — the shape was
taken from `aura_crm_opportunity_risks`, where it is also free text — and it is fine for a register
you read one project at a time. It stops being fine the moment the record has to answer *"is this
mine?"*.

Every other My Work source carries a real user id for assignment:

| Source | Assignment field |
|---|---|
| Engineering drawing | `ownerId` |
| Engineering RFI | `assignedTo`, `ownerId` |
| Quality NCR | `assignedTo` |
| HSE CAPA | `assignedTo` |
| Procurement PO | `ownerId` |
| **Project risk / issue** | **`owner` — free text** |

So My Work can answer *"risks I raised"* and cannot answer *"risks assigned to me"* — and the
second is the half a project manager actually opens My Work for. Matching a typed name against an
actor id would be a guess presented as a fact, and is refused: a test pins that someone else's risk
does not appear merely because the actor's id resembles the owner text.

**Consequence today:** §21 items reach My Work with `scopes: ['created']` only. Real, useful, and
half the feature.

**Fix:** an `owner_id` column beside `owner_name` on both tables, nullable, with the free-text field
kept for people who are not users of the system — a subcontractor's engineer, say. That is a schema
decision and a UI decision, so it is recorded rather than slipped in alongside the aggregation.

---

## AURA-FIT-001 — three fitness tests are timeout-flaky under parallel load

`architecture.fitness.test.ts`, `error-taxonomy.fitness.test.ts` and `money-rounding.fitness.test.ts`
each failed with `Test timed out in 5000ms` on three consecutive full `pnpm test` runs, then passed
on a fourth forced run of the same commit. The pre-§21 baseline passed both cached and forced.

All three walk the whole repository filesystem. Measured on the same machine, same commit:

| Test | Standalone | Under full turbo load |
|---|---|---|
| `architecture.fitness` | 572 ms | 17 951 ms |
| `error-taxonomy.fitness` | 787 ms | 20 016 ms |
| `money-rounding.fitness` | 566 ms | 5 981 ms |

**Not assertion failures.** Nothing was found wrong; the scans did not finish. Against vitest's
5 s default they hold a 6–9× margin idle, and that margin is being consumed in practice when tsc
builds, a Postgres container on tmpfs and 50 concurrent turbo tasks compete for the same disk.

Not attributed to §21: a forced full run on the §21 branch passes 51/51, and the added files are
~10 sources among thousands. What §21 did was surface it, by making enough packages cache-miss at
once.

**Deliberately not fixed here.** The obvious change — an explicit timeout for these three — is
adjacent to "make it green by relaxing the check", and that call is not mine to make silently.
Stated as the choice it is: these are I/O-bound scans rather than behavioural tests, so a longer
timeout would arguably be describing them correctly rather than weakening them. Recorded for a
decision, not actioned.

---

## AURA-MIG-001 — the migration gate reports history drift as a contradiction

`GET /health` returned:

```json
{"code":"SCHEMA_MIGRATION_PENDING",
 "message":"database schema is behind the application; 0 migration(s) pending",
 "pending":[]}
```

Behind, with nothing pending, naming nothing. An operator cannot act on that.

`MigrationGateService` tracks two independent kinds of drift and logs them as separate incidents:

- `pending` — files on disk not in the ledger → *"SCHEMA BEHIND CODE"*
- `appliedButAbsent` — ledger rows with no file on disk → *"MIGRATION HISTORY DRIFT"* (G-09)

Both set `degraded`, and the HTTP body collapses both into `SCHEMA_MIGRATION_PENDING` with the
`pending` array — which is empty in the second case. So the direction of drift, and the migration
names that would identify it, are lost at exactly the boundary an operator reads.

The internal model is right; the response shape discards half of it. A distinct code
(`SCHEMA_MIGRATION_DRIFT`) carrying `appliedButAbsent` would fix it.

**How it was observed:** by causing it. Checking out a pre-§21 commit to compare test behaviour
removed `0283_project_risks_issues.sql` from disk while the database still had it applied, and the
API evaluated in that window. The gate runs once at `onModuleInit`, so the verdict is held until
restart. That part is correct behaviour — deploys migrate before serving — and the file is back;
the API needs a restart, and the reporting defect stands on its own.

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

**Update 2026-09-09.** A full suite run — 118 passed, 1 skipped, exit 0, first attempt, no retries and
no reruns — had all three of these pass, alongside nine new §21 specs and a database recreated from
zero. That is a data point, **not a resolution**: the failures were always intermittent, so one
clean run is exactly what a latent flake looks like on a good day. The finding stays OPEN and
undiagnosed. Closing it needs a cause, not a green run.
